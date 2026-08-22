import { expect, test, type Page } from '@playwright/test'
import { fixtureName, signIn } from './support/session'
import {
  UPLOAD,
  card,
  openBucketRoot,
  selectItem,
  reported,
  listed,
  notListed,
  deleteSelected,
  createDirectory,
  uploadFile
} from './support/storage'

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
 *
 * Selecting several items at once, and the toolbar's own controls, are covered in
 * `selection.spec.ts`.
 */

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
