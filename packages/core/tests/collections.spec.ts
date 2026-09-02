import { expect, test, type Page } from '@playwright/test'
import { confirm, fixtureName, signIn } from './support/session'
import { SLOW, reported, openCollection, row, createDocument } from './support/collections'

/**
 * The database screens: listing a collection, and the document round trip.
 *
 * Collections themselves are declared in `genoa.config` and cannot be created from the interface,
 * so the fixture here is a **document**. Each test creates its own, identified by a random name, and
 * removes it again in `afterEach` — nothing that existed before the run is opened or edited.
 *
 * The editor builds its inputs from the collection's schema, so the field names below come from the
 * `test` collection in `genoa.config/collections.js`.
 *
 * Selecting several documents and deleting them in one action is covered in `selection.spec.ts`.
 */

const deleteDocument = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Delete' }).click()
  await confirm(page)
  await reported(page, 'Document deleted')
}

test.describe('a document', () => {
  let name: string

  test.beforeEach(async ({ page }) => {
    name = fixtureName('doc')
    await signIn(page)
    await openCollection(page)
  })

  test.afterEach(async ({ page }) => {
    // The document may already be gone, or may never have been created; either way this leaves
    // nothing behind.
    await openCollection(page)
    if (await row(page, name).count() === 0) return

    await row(page, name).first().click()
    await deleteDocument(page)
  })

  test('is created from the collection screen', async ({ page }) => {
    await createDocument(page, name)
    await expect(page.getByRole('heading', { name: /Update/ })).toBeVisible()
  })

  test('shows its values when reopened', async ({ page }) => {
    await createDocument(page, name)

    // Reloaded rather than trusted: the editor is seeded from the loaded document, and the point is
    // that the value was really stored.
    await page.reload()
    await expect(page.getByLabel('name:', { exact: true })).toHaveValue(name)
  })

  test('keeps an edited value after saving', async ({ page }) => {
    await createDocument(page, name)

    const edited = `${name}-edited`
    await page.getByLabel('name:', { exact: true }).fill(edited)
    await page.getByRole('button', { name: 'Update' }).click()
    await reported(page, 'Document updated')

    await page.reload()
    await expect(page.getByLabel('name:', { exact: true })).toHaveValue(edited)

    name = edited
  })

  test('takes a boolean and keeps it', async ({ page }) => {
    await createDocument(page, name)

    const flag = page.getByRole('checkbox').first()
    await flag.check()
    await page.getByRole('button', { name: 'Update' }).click()
    await reported(page, 'Document updated')

    await page.reload()
    await expect(page.getByRole('checkbox').first()).toBeChecked()
  })

  test('appears in the collection listing', async ({ page }) => {
    await createDocument(page, name)

    await openCollection(page)
    await expect(row(page, name).first()).toBeVisible({ timeout: SLOW })
  })

  test('is gone once deleted', async ({ page }) => {
    await createDocument(page, name)
    await deleteDocument(page)

    await openCollection(page)
    await expect(row(page, name)).toHaveCount(0, { timeout: SLOW })
  })
})
