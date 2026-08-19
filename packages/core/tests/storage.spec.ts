import { expect, test, type Locator, type Page } from '@playwright/test'
import { confirm, fixtureName, signIn } from './support/session'

/**
 * The storage browser: directories, uploads, renaming and deletion.
 *
 * Each test creates a directory of its own and works only inside it, so nothing that existed before
 * the run can be selected, renamed or removed. The directory goes away again in `afterEach`,
 * whether or not the test reached its own cleanup.
 *
 * **Selection is the precondition for deletion.** The delete control only appears once something is
 * selected, which is itself worth asserting: a selection control that renders but does not select
 * would leave the toolbar permanently empty, and nothing but a browser would notice.
 */

const BUCKET = 'genoacms'

/** Storage operations reach real infrastructure, which is slower than the default expectation. */
const SLOW = 20_000

/** A file the tests upload, built in memory rather than committed as a fixture. */
const UPLOAD = {
  name: 'hello.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from('written by the end-to-end suite\n')
}

/** The bucket's root, exactly as the bucket list links to it: an empty path, not a slash. */
const bucketRoot = `/storage/${BUCKET}/contents`

const openBucketRoot = async (page: Page): Promise<void> => {
  await page.goto(bucketRoot)
  await expect(page.getByRole('button', { name: 'Create directory' })).toBeVisible()
}

/**
 * A card in the grid, by the text it shows.
 *
 * Matched as a substring rather than exactly: each card's accessible name is preceded by its icon,
 * so an exact or anchored match does not hold. Fixture names carry a random suffix, so a substring
 * cannot collide with another test's directory.
 */
const card = (page: Page, name: string): Locator =>
  page.getByRole('link', { name })

/**
 * The checkbox overlaying an item.
 *
 * Labelled `select-<full object name>`, so a file inside a directory carries the whole path. Matched
 * loosely on purpose: the test knows the leaf name, not the prefix the browser is currently under.
 */
const selectItem = async (page: Page, leaf: string): Promise<void> => {
  await page.getByRole('button', { name: new RegExp(`^select-.*${leaf}/?$`) }).click()
}

/**
 * Waits for the screen's own report of an outcome.
 *
 * Storage operations go to real infrastructure and take longer than Playwright's default patience,
 * and the toast says the operation actually succeeded rather than that the grid happens to have
 * re-rendered. Both are worth waiting for, in that order.
 */
const reported = async (page: Page, message: string): Promise<void> => {
  await expect(page.getByText(message, { exact: true }).first()).toBeVisible({ timeout: SLOW })
}

/**
 * Asserts an item is listed, reloading until it is.
 *
 * Object listing is eventually consistent, so an item can be created successfully and still be
 * missing from the next listing. Retrying a reload asserts the thing that actually matters — that it
 * is really there — instead of that the grid happened to re-render in time.
 */
const listed = async (page: Page, name: string): Promise<void> => {
  await expect(async () => {
    await page.reload()
    await expect(card(page, name)).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: SLOW })
}

/** The counterpart for removal, which is eventually consistent in the same way. */
const notListed = async (page: Page, name: string): Promise<void> => {
  await expect(async () => {
    await page.reload()
    await expect(card(page, name)).toHaveCount(0, { timeout: 2_000 })
  }).toPass({ timeout: SLOW })
}

const deleteSelected = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await confirm(page)
  await reported(page, 'Deleted')
}

const createDirectory = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name: 'Create directory' }).click()
  await page.getByLabel('Directory name:').fill(name)
  // Exact: "Create directory" also contains "Create".
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await reported(page, 'Directory created')
  await listed(page, name)
}

const uploadFile = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Upload object' }).click()
  await page.locator('input[type="file"]').setInputFiles(UPLOAD)
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  await reported(page, 'Upload successful')
  await listed(page, UPLOAD.name)
}

/** Renaming is reached through the item's context menu, not a toolbar button. */
const rename = async (page: Page, from: string, to: string): Promise<void> => {
  await card(page, from).click({ button: 'right' })
  // The menu entry, not the dialog title or its submit button, which share the word.
  await page.getByRole('button', { name: 'Rename', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Rename' })
  await dialog.getByRole('textbox').fill(to)
  await dialog.getByRole('button', { name: 'Rename' }).click()
  await reported(page, 'Renamed')
  await listed(page, to)
}

test.describe('the storage browser', () => {
  let directory: string

  test.beforeEach(async ({ page }) => {
    directory = fixtureName('dir')
    await signIn(page)
  })

  test.afterEach(async ({ page }) => {
    // Removing the directory removes anything left inside it, so one cleanup covers every test.
    await openBucketRoot(page)
    if (await card(page, directory).count() === 0) return

    await selectItem(page, directory)
    await deleteSelected(page)
    await notListed(page, directory)
  })

  test('creates a directory', async ({ page }) => {
    await openBucketRoot(page)
    await createDirectory(page, directory)
  })

  test('uploads a file into it', async ({ page }) => {
    await openBucketRoot(page)
    await createDirectory(page, directory)

    await card(page, directory).click()
    await uploadFile(page)
  })

  test('renames an uploaded file, and the new name survives a reload', async ({ page }) => {
    await openBucketRoot(page)
    await createDirectory(page, directory)
    await card(page, directory).click()
    await uploadFile(page)

    const renamed = 'renamed.txt'
    await rename(page, UPLOAD.name, renamed)

    // The old name must be gone, not merely the new one present: a rename that copied rather than
    // moved would satisfy the first assertion alone.
    await expect(card(page, UPLOAD.name)).toHaveCount(0)
  })

  test('deletes a file, and the delete control appears only with a selection', async ({ page }) => {
    await openBucketRoot(page)
    await createDirectory(page, directory)
    await card(page, directory).click()
    await uploadFile(page)

    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)

    await selectItem(page, UPLOAD.name)
    await deleteSelected(page)
    await notListed(page, UPLOAD.name)
  })
})
