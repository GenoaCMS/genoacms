import { expect, test, type Locator, type Page } from '@playwright/test'
import { confirm, fixtureName, signIn } from './support/session'

/**
 * The database screens: listing a collection, and the document round trip.
 *
 * Collections themselves are declared in `genoa.config` and cannot be created from the interface,
 * so the fixture here is a **document**. Each test creates its own, identified by a random name, and
 * removes it again in `afterEach` — nothing that existed before the run is opened or edited.
 *
 * The editor builds its inputs from the collection's schema, so the field names below come from the
 * `test` collection in `genoa.config/collections.js`.
 */

const COLLECTION = 'test'
const SLOW = 20_000

/** Firestore writes are slower than Playwright's default patience. */
const reported = async (page: Page, message: string): Promise<void> => {
  await expect(page.getByText(message, { exact: true }).first()).toBeVisible({ timeout: SLOW })
}

const openCollection = async (page: Page): Promise<void> => {
  await page.goto(`/collections/${COLLECTION}`)
  await expect(page.getByRole('heading', { name: `Collection: ${COLLECTION}` })).toBeVisible()
}

/** The row for a document, found by a value it displays. */
const row = (page: Page, name: string): Locator =>
  page.getByRole('link').filter({ hasText: name })

/**
 * Creates a document and lands on its page.
 *
 * Creation navigates to the new document, so the assertion that it worked is the URL changing —
 * the collection listing is paginated and a new row is not necessarily visible on it.
 */
const createDocument = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name: 'New document' }).click()

  // The primary key is not an editable field, so the only value the test sets is `name`.
  const dialog = page.getByRole('dialog', { name: 'New document' })
  await dialog.getByLabel('name:', { exact: true }).fill(name)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(page).toHaveURL(new RegExp(`/collections/${COLLECTION}/[^/]+$`), { timeout: SLOW })
}

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
