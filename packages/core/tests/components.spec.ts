import { expect, test, type Locator, type Page } from '@playwright/test'
import { fixtureName, signIn } from './support/session'

/**
 * The two component surfaces: the prebuilt catalogue, and the dynamic code editor.
 *
 * They are different products sharing a menu. A **prebuilt** entry describes a component that
 * already exists in the consuming app — the CMS holds its name and attribute schema. A **dynamic**
 * component is authored here: its source lives in the CMS, and committing it runs static analysis,
 * compiles a bundle, signs it and publishes an executable.
 *
 * Every fixture is created by the test that uses it and deleted afterwards. Deleting a prebuilt
 * entry requires typing its name back, which is itself worth exercising: the confirm button stays
 * disabled until the typed name matches.
 */

const SLOW = 20_000

const reported = async (page: Page, message: string | RegExp): Promise<void> => {
  await expect(page.getByText(message).first()).toBeVisible({ timeout: SLOW })
}

const card = (page: Page, name: string): Locator =>
  page.getByRole('link', { name })

// ---------------------------------------------------------------------------------------------
// Prebuilt components
// ---------------------------------------------------------------------------------------------

const openPrebuilt = async (page: Page): Promise<void> => {
  await page.goto('/components/prebuilt')
  await expect(page.getByRole('heading', { name: 'Prebuilt component management' })).toBeVisible()
}

/** Registering navigates to the new entry, so the URL is what confirms it. */
const registerComponent = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name: 'Register component' }).click()

  const dialog = page.getByRole('dialog', { name: 'Register a new component' })
  await dialog.getByLabel('Component name:').fill(name)
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(page).toHaveURL(/\/components\/prebuilt\/[^/]+$/, { timeout: SLOW })
}

const deletePrebuilt = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name: 'Delete component' }).click()

  const dialog = page.getByRole('dialog', { name: 'Delete the component' })
  const confirmButton = dialog.getByRole('button', { name: `Yes, delete ${name}` })

  // Guarded by retyping the name: the control is inert until the two match.
  await expect(confirmButton).toBeDisabled()
  await dialog.getByRole('textbox').fill(name)
  await expect(confirmButton).toBeEnabled()

  await confirmButton.click()
  await expect(page).toHaveURL(/\/components\/prebuilt\/?$/, { timeout: SLOW })
}

test.describe('a prebuilt component', () => {
  let name: string

  test.beforeEach(async ({ page }) => {
    name = fixtureName('prebuilt')
    await signIn(page)
    await openPrebuilt(page)
  })

  test.afterEach(async ({ page }) => {
    await openPrebuilt(page)
    if (await card(page, name).count() === 0) return

    await card(page, name).first().click()
    await deletePrebuilt(page, name)
  })

  test('is registered and appears in the catalogue', async ({ page }) => {
    await registerComponent(page, name)

    await openPrebuilt(page)
    await expect(card(page, name).first()).toBeVisible({ timeout: SLOW })
  })

  test('can be renamed, and the new name persists', async ({ page }) => {
    await registerComponent(page, name)

    const renamed = `${name}-renamed`
    await page.getByRole('button', { name: 'Change name' }).click()

    const dialog = page.getByRole('dialog', { name: 'Change name' })
    await dialog.getByRole('textbox').fill(renamed)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await reported(page, /updated|saved/i)

    await page.reload()
    await expect(page.getByText(`Component: ${renamed}`)).toBeVisible({ timeout: SLOW })

    name = renamed
  })

  test('takes an attribute, which survives saving', async ({ page }) => {
    await registerComponent(page, name)

    await page.getByRole('button', { name: 'Add attribute' }).click()
    const dialog = page.getByRole('dialog', { name: 'New attribute' })
    await dialog.getByRole('button', { name: 'string' }).first().click()

    // The attribute exists in the form until it is submitted, so saving is part of the test.
    await page.getByRole('button', { name: 'Submit' }).click()
    await reported(page, /updated|saved/i)

    await page.reload()
    await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: SLOW })
  })
})

// ---------------------------------------------------------------------------------------------
// Dynamic components
// ---------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------
// Cleanup that goes around the interface
// ---------------------------------------------------------------------------------------------

const BUCKET = 'genoacms'

/**
 * Where the editor keeps a dynamic component, mirrored from `components/editor/io.ts`.
 *
 * Cleanup has to reach these directly because **deleting a dynamic component does not work** — see
 * the test marked as expected-to-fail below. Without this the suite would leave a component behind
 * on every run.
 */
const DYNAMIC_DIRECTORIES = [
  ['.genoacms', 'components', 'edited'],
  ['.genoacms', 'components', 'definitions'],
  // Creating a dynamic component also registers it in the prebuilt catalogue, so its entry has to
  // go too — otherwise the component vanishes from the editor but lingers as a component entry.
  ['.genoacms', 'components', 'prebuilt']
]

/**
 * Walks the storage browser into a directory, one card at a time.
 *
 * Each click is waited out: the browser navigates client-side, and clicking the next segment before
 * the current listing has arrived lands somewhere else while appearing to succeed.
 */
const openStorageDirectory = async (page: Page, segments: string[]): Promise<void> => {
  await page.goto(`/storage/${BUCKET}/contents`)

  // Scoped to the listing: the navigation sidebar has links of its own, and "components" there
  // would take the walk to a different screen entirely.
  const grid = page.getByRole('main')
  const walked: string[] = []
  for (const segment of segments) {
    await grid.getByRole('link', { name: segment }).first().click()
    walked.push(segment)
    await expect(page.locator('h1')).toHaveText(`${walked.join('/')}/`, { timeout: SLOW })
  }
}

/** Removes a dynamic component's objects, since the delete action cannot. */
const removeDynamicObjects = async (page: Page, uid: string): Promise<void> => {
  for (const directory of DYNAMIC_DIRECTORIES) {
    await openStorageDirectory(page, directory)

    const item = page.getByRole('button', { name: new RegExp(`^select-.*${uid}$`) })
    if (await item.count() === 0) continue

    await item.first().click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('button', { name: 'Yes' }).click()
    await expect(page.getByText('Deleted', { exact: true }).first()).toBeVisible({ timeout: SLOW })
  }
}

const openEditor = async (page: Page): Promise<void> => {
  await page.goto('/components/editor')
  await expect(page.getByRole('heading', { name: 'Component editor' })).toBeVisible()
}

/** Creates a dynamic component and returns its uid, which is the last segment of the URL. */
const createDynamic = async (page: Page, name: string): Promise<string> => {
  await page.getByRole('button', { name: 'Create component' }).click()

  const dialog = page.getByRole('dialog', { name: 'Create a new component' })
  await dialog.getByLabel('Name:').fill(name)
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(page).toHaveURL(/\/components\/editor\/[^/]+$/, { timeout: SLOW })
  return page.url().split('/').pop() as string
}

/**
 * Types into the code editor.
 *
 * CodeMirror renders a contenteditable rather than a textarea, so the text goes in through the
 * keyboard the way an author would enter it.
 */
const writeCode = async (page: Page, code: string): Promise<void> => {
  // The commit modal holds a diff editor of its own, so once it is open there is more than one
  // editor on the page. The author's is first either way.
  const editor = page.locator('.cm-content').first()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')

  // The draft is written a second after typing stops, with nothing on screen to say so. Waiting for
  // that request is the difference between testing the editor and testing how fast the test types.
  const autoSaved = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.ok(),
    { timeout: SLOW }
  )
  await page.keyboard.type(code)
  await autoSaved
}

test.describe('a dynamic component', () => {
  let name: string
  let uid: string

  test.beforeEach(async ({ page }) => {
    name = fixtureName('dynamic')
    await signIn(page)
    await openEditor(page)
  })

  test.afterEach(async ({ page }) => {
    if (uid !== undefined) await removeDynamicObjects(page, uid)
  })

  test('is created and opens in the code editor', async ({ page }) => {
    uid = await createDynamic(page, name)
    await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: SLOW })
  })

  test('keeps draft code without committing it', async ({ page }) => {
    uid = await createDynamic(page, name)
    await writeCode(page, 'export const answer = 42\n')

    // The draft is saved as it is typed; reloading shows whether it really was.
    await page.reload()
    await expect(page.locator('.cm-content').first()).toContainText('answer', { timeout: SLOW })
  })

  test('commits, which signs and publishes it', async ({ page }) => {
    test.setTimeout(180_000)
    uid = await createDynamic(page, name)
    await writeCode(page, 'export const answer = 42\n')

    // Committing runs static analysis, compiles, signs with the key hierarchy and publishes. It is
    // the slowest thing the product does, and the one most worth knowing still works.
    await page.getByRole('button', { name: 'Commit' }).click()

    const dialog = page.getByRole('dialog', { name: 'Commit changes' })
    await dialog.getByRole('textbox').last().fill('committed by the end-to-end suite')
    await dialog.getByRole('button', { name: /commit/i }).click()

    await reported(page, /commited|committed/i)
  })

  /**
   * **Known defect, so this test is expected to fail.**
   *
   * The delete form sends only the component's uid: the input the operator types the name into has
   * no `name` attribute, so the confirmation never reaches the server, which refuses because the
   * name it received does not match. The client then reports "Component deleted" regardless,
   * because it never looks at what the server returned.
   *
   * The result is a destructive action that always claims to have succeeded and never does. It is
   * left failing rather than deleted or weakened: the assertion below is what the feature is
   * supposed to do, and it will start passing the moment the form is fixed.
   */
  test.fail('is gone once deleted', async ({ page }) => {
    uid = await createDynamic(page, name)

    await page.getByRole('button', { name: 'Delete component' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete the component' })
    await dialog.getByRole('textbox').fill(name)
    await dialog.getByRole('button', { name: /Yes, delete/ }).click()
    await reported(page, 'Component deleted')

    await openEditor(page)
    await expect(card(page, name)).toHaveCount(0, { timeout: SLOW })
  })
})
