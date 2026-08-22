import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Driving the collection screens.
 *
 * Shared by `collections.spec.ts` and `selection.spec.ts`, for the same reason the storage helpers
 * are: one definition of what a document row is, and one idea of how long Firestore is allowed to
 * take.
 *
 * Collections themselves are declared in `genoa.config` and cannot be created from the interface, so
 * every fixture here is a **document** in the `test` collection.
 */

const COLLECTION = 'test'

/** Firestore writes are slower than Playwright's default patience. */
const SLOW = 20_000

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

export {
  COLLECTION,
  SLOW,
  reported,
  openCollection,
  row,
  createDocument
}
