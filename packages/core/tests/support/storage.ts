import { expect, type Locator, type Page } from '@playwright/test'
import { confirm } from './session'

/**
 * Driving the storage browser.
 *
 * Shared by `storage.spec.ts` and `selection.spec.ts` rather than copied into each. Two suites that
 * each keep their own idea of what "the card for a file" or "wait until it is really listed" means
 * will eventually disagree, and the one that is wrong will look like a product defect.
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
const itemCheckbox = (page: Page, leaf: string): Locator =>
  page.getByRole('button', { name: new RegExp(`^select-.*${leaf}/?$`) })

const selectItem = async (page: Page, leaf: string): Promise<void> => {
  await itemCheckbox(page, leaf).click()
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

/** Uploads the fixture file, optionally under a name of its own. */
const uploadFile = async (page: Page, name: string = UPLOAD.name): Promise<void> => {
  await page.getByRole('button', { name: 'Upload object' }).click()
  await page.locator('input[type="file"]').setInputFiles({ ...UPLOAD, name })
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  await reported(page, 'Upload successful')
  await listed(page, name)
}

export {
  BUCKET,
  SLOW,
  UPLOAD,
  bucketRoot,
  openBucketRoot,
  card,
  itemCheckbox,
  selectItem,
  reported,
  listed,
  notListed,
  deleteSelected,
  createDirectory,
  uploadFile
}
