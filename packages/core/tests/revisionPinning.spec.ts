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

/** A component's name is the function its source declares, so both revisions define exactly that. */
const sourceFor = (name: string, heading: string): string =>
  'interface StringAttribute<Pattern, MaxLength, Default> { _brand: Pattern }\n' +
  `export function ${name} (heading: StringAttribute<".*", 120, "${heading}">) { return heading }\n`

const openEditor = async (page: Page): Promise<void> => {
  await page.goto('/components/editor')
  await expect(page.getByRole('heading', { name: 'Component editor' })).toBeVisible()
}

const createDynamic = async (page: Page, name: string): Promise<string> => {
  await openEditor(page)
  await page.getByRole('button', { name: 'Create component' }).click()

  const dialog = page.getByRole('dialog', { name: 'Create a new component' })
  await dialog.getByLabel('Name:').fill(name)
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

const removeObjects = async (page: Page, directory: string[], match: RegExp): Promise<void> => {
  // The directory may already be gone: it is a prefix, and this suite empties some of them.
  if (!await openDirectory(page, directory)) return

  const items = page.getByRole('button', { name: match })
  if (await items.count() === 0) return

  for (const item of await items.all()) await item.click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Yes' }).click()
  await expect(page.getByText('Deleted', { exact: true }).first()).toBeVisible({ timeout: SLOW })
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

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await signIn(page)

  // Named individually rather than swept by prefix. Deleting a dynamic component through the
  // interface does not work — see `components.spec.ts` — so its objects have to go directly.
  await removeObjects(page, ['.genoacms', 'pages', 'readables'], new RegExp(`^select-.*${pageName}`))
  await removeObjects(page, ['.genoacms', 'pages', 'entries'], new RegExp(`^select-.*${pageName}`))
  await removeObjects(page, ['.genoacms', 'components', uid], /^select-/)
  for (const directory of [['edited'], ['definitions'], ['prebuilt']]) {
    await removeObjects(page, ['.genoacms', 'components', ...directory], new RegExp(`^select-.*${uid}$`))
  }

  await page.close()
})

test('a component is committed once', async ({ page }) => {
  test.setTimeout(180_000)
  uid = await createDynamic(page, componentName)
  await commitRevision(page, uid, sourceFor(componentName, 'first'))
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
  await commitRevision(page, uid, sourceFor(componentName, 'second'))

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
  expect(await openDirectory(page, ['.genoacms', 'components', uid])).toBe(true)

  await expect(page.getByRole('button', { name: /^select-/ })).toHaveCount(2, { timeout: SLOW })
})
