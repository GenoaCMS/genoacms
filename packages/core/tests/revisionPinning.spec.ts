import { expect, test, type Page } from '@playwright/test'
import { fixtureName, identifierFixtureName, signIn } from './support/session'
import { SLOW, openDirectory, readObjectJSON } from './support/storage'

/**
 * A published page names the revision it was built against, and keeps naming it.
 *
 * This is the property the whole delivery model rests on, and **the half that matters is the
 * negative one**: committing a newer revision must not change what a published page serves. A pin
 * that silently follows the latest commit is not a pin, and nothing about the happy path would
 * reveal the difference — the page would render, the signature would verify, and the artifact it
 * named would be a perfectly valid one. Only comparing the published document before and after an
 * unrelated commit can tell the two apart.
 *
 * So this suite reads the **contents** of the published tree rather than checking that a file
 * exists. Everything else in these suites stops at "it is listed", which cannot distinguish a
 * correct document from an empty one.
 *
 * ## Serial, and one fixture throughout
 *
 * Each step depends on the state the previous one left: a component with two commits, and a page
 * built between them. Splitting that into independent tests would mean rebuilding the whole history
 * per test, and every one of them would take the slowest path the product has.
 */

test.describe.configure({ mode: 'serial' })

const READABLES = ['.genoacms', 'pages', 'readables']

/**
 * A component **body**, which is all an author writes.
 *
 * The entry function and its parameters are emitted from the component's header, so nothing here
 * declares a signature — and a component registered without attributes has none, which is why the
 * two revisions differ in a returned literal rather than in a parameter.
 */
const sourceFor = (heading: string): string => `return '${heading}'\n`

const createDynamic = async (page: Page, name: string): Promise<string> => {
  // Through the registrar: a component is born in one place whichever kind it is, and the kind is
  // chosen there.
  await page.goto('/components/registrar')
  await page.getByRole('button', { name: 'Register component' }).click()

  const dialog = page.getByRole('dialog', { name: 'Register a new component' })
  await dialog.getByLabel('Component name:').fill(name)
  await dialog.getByRole('radio', { name: 'Code it here' }).check()
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(page).toHaveURL(/\/components\/editor\/[^/]+$/, { timeout: SLOW })
  return page.url().split('/').pop() as string
}

/**
 * Types a revision into the editor and commits it.
 *
 * The draft is written a second after typing stops, with nothing on screen to say so, so the
 * autosave request is waited for — otherwise the commit races the save and commits the previous
 * revision, which would make this suite pass for the wrong reason.
 */
const commitRevision = async (page: Page, uid: string, source: string): Promise<void> => {
  await page.goto(`/components/editor/${uid}`)

  const editor = page.locator('.cm-content').first()
  await expect(editor).toBeVisible({ timeout: SLOW })
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')

  const autoSaved = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.ok(),
    { timeout: SLOW }
  )
  await page.keyboard.type(source)
  await autoSaved

  await page.getByRole('button', { name: 'Commit' }).click()
  const dialog = page.getByRole('dialog', { name: 'Commit changes' })
  await dialog.getByRole('textbox').last().fill('committed by the end-to-end suite')
  await dialog.getByRole('button', { name: /commit/i }).click()

  await expect(page.getByText('Code commited').first()).toBeVisible({ timeout: SLOW })
}

const createPageRootedIn = async (page: Page, name: string, component: string): Promise<void> => {
  await page.goto('/components/pages')
  await page.getByRole('button', { name: 'Create page' }).click()
  await page.getByLabel('Name:').fill(name)
  await page.getByLabel('Component:').selectOption({ label: component })
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: SLOW })
}

/** Builds the page, which is what publishes a tree. */
const buildPage = async (page: Page, name: string): Promise<void> => {
  await page.goto(`/components/pages/${name}`)
  await page.getByRole('button', { name: 'Build' }).click()
  await expect(page.getByText('Saved').first()).toBeVisible({ timeout: SLOW })
}

/** The revision the published page is pinned to, read out of the signed tree itself. */
const publishedRevision = async (page: Page, name: string): Promise<string | undefined> => {
  const envelope = await readObjectJSON(page, READABLES, name) as {
    type: string
    payload: { commitId?: string }
  }

  // Asserted here rather than in a test of its own: every read below depends on it, and a tree that
  // arrived unsigned would otherwise show up as a confusing `undefined` revision.
  expect(envelope.type).toBe('genoacms.pageTree.v1')
  return envelope.payload.commitId
}

/**
 * Deletes the page from the list, by selecting it and confirming.
 *
 * Reaching into storage would clean up just as well and assert nothing. Deleting the way an operator
 * does makes the last tests here a test of deletion too.
 *
 * **Only this fixture's checkbox is ever clicked.** The list holds the instance's real pages beside
 * it, and the confirmation phrase is read off the dialog rather than composed here — a test that
 * assembled it independently could pass while the dialog named something else.
 */
const deletePage = async (page: Page, name: string): Promise<void> => {
  await page.goto('/components/pages')

  const box = page.locator(`button[aria-label^="select-"][aria-label*="${name}"]`)
  await expect(box).toHaveCount(1, { timeout: SLOW })
  await box.click()

  await page.getByRole('button', { name: 'Delete selected' }).click()
  const phrase = (await page.locator('code').innerText()).trim()
  expect(phrase).toContain(name)

  await page.locator('input[name="confirmation"]').fill(phrase)
  await page.getByRole('button', { name: /^Yes, delete/ }).click()
}

/** Deletes the component the same way, by retyping its name. */
const deleteComponent = async (page: Page, uid: string, name: string): Promise<void> => {
  await page.goto(`/components/editor/${uid}`)
  await page.getByRole('button', { name: 'Delete component' }).click()

  const dialog = page.getByRole('dialog', { name: 'Delete the component' })
  await dialog.getByRole('textbox').fill(name)
  await dialog.getByRole('button', { name: /Yes, delete/ }).click()
  await expect(page.getByText('Component deleted').first()).toBeVisible({ timeout: SLOW })
}

let componentName: string
let pageName: string
let uid: string
let firstRevision: string | undefined

test.beforeAll(() => {
  componentName = identifierFixtureName('pin')
  pageName = fixtureName('pin')
})

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

/**
 * Removes whatever is left, through storage.
 *
 * The last two tests delete through the interface and assert the result, which is the point of them.
 * This is the safety net for the runs where they never get there: a failure in an earlier test would
 * otherwise leave a component and a page behind on every run.
 */
const sweep = async (page: Page, directory: string[], match: RegExp): Promise<void> => {
  if (!await openDirectory(page, directory)) return

  const items = page.getByRole('button', { name: match })
  if (await items.count() === 0) return

  for (const item of await items.all()) await item.click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Yes' }).click()
  await expect(page.getByText('Deleted', { exact: true }).first()).toBeVisible({ timeout: SLOW })
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await signIn(page)

  // Named individually, never swept by prefix: these directories hold the instance's real content.
  await sweep(page, ['.genoacms', 'pages', 'readables'], new RegExp(`^select-.*${pageName}`))
  await sweep(page, ['.genoacms', 'pages', 'entries'], new RegExp(`^select-.*${pageName}`))
  if (uid !== undefined) {
    await sweep(page, ['.genoacms', 'components', 'dynamic', 'executables', uid], /^select-/)
    for (const directory of [['dynamic'], ['headers']]) {
      await sweep(page, ['.genoacms', 'components', ...directory], new RegExp(`^select-.*${uid}`))
    }
  }

  await page.close()
})

/** Asserts nothing of this fixture is left anywhere the CMS writes. */
const assertGone = async (page: Page, directory: string[], match: RegExp): Promise<void> => {
  // The directory itself may be gone, which is the strongest form of absent: a prefix stops existing
  // once its last object does.
  if (!await openDirectory(page, directory)) return

  await expect(page.getByRole('button', { name: match })).toHaveCount(0, { timeout: SLOW })
}

test('a component is committed once', async ({ page }) => {
  test.setTimeout(180_000)
  uid = await createDynamic(page, componentName)
  await commitRevision(page, uid, sourceFor('first'))
})

test('a page built against it is pinned to that revision', async ({ page }) => {
  test.setTimeout(180_000)
  await createPageRootedIn(page, pageName, componentName)
  await buildPage(page, pageName)

  firstRevision = await publishedRevision(page, pageName)

  expect(firstRevision).toMatch(/^[0-9a-f-]{36}$/)
})

test('committing a newer revision does not change the published page', async ({ page }) => {
  // The point of the whole mechanism. Without the pin the published tree would follow this commit
  // immediately, and every assertion above would still have passed.
  test.setTimeout(180_000)
  await commitRevision(page, uid, sourceFor('second'))

  expect(await publishedRevision(page, pageName)).toBe(firstRevision)
})

test('republishing moves the pin to the newer revision', async ({ page }) => {
  // The other half: a pin that could never move would not be a pin either, it would be a component
  // frozen at its first commit.
  test.setTimeout(180_000)
  await buildPage(page, pageName)

  const republished = await publishedRevision(page, pageName)

  expect(republished).toMatch(/^[0-9a-f-]{36}$/)
  expect(republished).not.toBe(firstRevision)
})

test('every published revision keeps its own executable', async ({ page }) => {
  // Two commits, two artifacts, neither overwritten — which is what makes the older pin still
  // resolve to something after the component has moved on.
  expect(await openDirectory(page, ['.genoacms', 'components', 'dynamic', 'executables', uid])).toBe(true)

  await expect(page.getByRole('button', { name: /^select-/ })).toHaveCount(2, { timeout: SLOW })
})

test('deleting the page removes what it published', async ({ page }) => {
  await deletePage(page, pageName)

  await assertGone(page, ['.genoacms', 'pages', 'entries'], new RegExp(`^select-.*${pageName}`))
  await assertGone(page, ['.genoacms', 'pages', 'readables'], new RegExp(`^select-.*${pageName}`))
})

test('deleting the component removes every revision it published', async ({ page }) => {
  // The reason deletion and immutable artifacts are one step: each commit left an artifact that is
  // signed and independently verifiable, so any left behind would keep verifying for a component
  // that no longer exists.
  await deleteComponent(page, uid, componentName)

  await assertGone(page, ['.genoacms', 'components', 'dynamic', 'executables', uid], /^select-/)
  for (const directory of [['dynamic'], ['headers']]) {
    await assertGone(page, ['.genoacms', 'components', ...directory], new RegExp(`^select-.*${uid}`))
  }
})
