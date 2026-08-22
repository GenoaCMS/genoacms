import { expect, test, type Locator, type Page } from '@playwright/test'
import { confirm, fixtureName, signIn } from './support/session'
import {
  card,
  openBucketRoot,
  itemCheckbox,
  selectItem,
  listed,
  notListed,
  createDirectory,
  uploadFile
} from './support/storage'
import {
  SLOW,
  reported as reportedInCollection,
  openCollection,
  row,
  createDocument
} from './support/collections'

/**
 * Selecting several things, and acting on the selection.
 *
 * The storage browser and the collection listing share one selection implementation
 * (`$lib/script/selection/Selection.svelte`) behind two facades, and each screen puts the same three
 * controls on its toolbar: select all, unselect all, and delete. `Selection.test.ts` asserts the
 * rules of the core without a browser; this suite asserts that the screens are really wired to it —
 * that a checkbox selects, that "select all" reaches every item listed, and that deleting removes
 * everything selected rather than the last thing clicked.
 *
 * ## Nothing outside a fixture is ever selected
 *
 * "Select all" is only ever used **inside a directory this suite created**, never at a bucket root
 * or on a collection listing that holds real documents. Where the collection listing is concerned,
 * select-all is asserted and then *cleared* — this suite never deletes anything it did not create,
 * and a bulk deletion here only ever runs against rows it made itself.
 *
 * ## What is not covered
 *
 * The **picker window** — a storage or document field opening a second tab with a `selectionId`,
 * handshaking over `BroadcastChannel` and sending the chosen items back. Nothing in the shipped
 * `genoa.config` has a field that opens one: the `test` collection declares no reference property,
 * and reaching a storage-resource field means building the whole component-and-page fixture chain
 * that `pageComposition.spec.ts` already owns. The controller behind it
 * (`selection/SelectAction.svelte.ts`) is therefore verified by type-checking and reading only.
 */

// ---------------------------------------------------------------------------------------------
// The collection listing
// ---------------------------------------------------------------------------------------------

/**
 * A document's id, which the test knows only through the row's link.
 *
 * The test creates documents **by name**; the interface labels their checkboxes **by id**. The link
 * relates the two, and asking it is stabler than locating a checkbox by its position in the markup —
 * a checkbox that moves from an overlay to a column of its own is a change of appearance, not of
 * what it selects, and should not break the tests.
 */
const documentId = async (page: Page, name: string): Promise<string> => {
  const href = await row(page, name).first().getAttribute('href')
  return href?.split('/').pop() ?? ''
}

/** The checkbox for a document, addressed the way the interface labels it. */
const checkboxFor = (page: Page, id: string): Locator =>
  page.getByRole('button', { name: `Select ${id}`, exact: true })

const documentCheckbox = async (page: Page, name: string): Promise<Locator> =>
  checkboxFor(page, await documentId(page, name))

const deleteButton = (page: Page): Locator =>
  page.getByRole('button', { name: 'Delete', exact: true })

/** Deletes the current selection, confirming the count it reads out. */
const deleteSelectedDocuments = async (page: Page, expectedPhrase: string): Promise<void> => {
  await deleteButton(page).click()
  await expect(page.getByText(`Do you want to delete ${expectedPhrase}?`)).toBeVisible()
  await confirm(page)
  await reportedInCollection(page, 'Deleted')
}

/** Removes a document by name if it is still listed, whatever the test left behind. */
const sweepDocument = async (page: Page, name: string): Promise<void> => {
  await openCollection(page)
  if (await row(page, name).count() === 0) return

  await (await documentCheckbox(page, name)).click()
  await deleteSelectedDocuments(page, 'one document')
}

test.describe('selecting documents', () => {
  let first: string
  let second: string

  test.beforeEach(async ({ page }) => {
    first = fixtureName('doc')
    second = fixtureName('doc')
    await signIn(page)
    await openCollection(page)
  })

  test.afterEach(async ({ page }) => {
    // Named individually rather than swept by prefix: a run that failed early must not authorise
    // deleting rows it never created.
    await sweepDocument(page, first)
    await sweepDocument(page, second)
  })

  test('offers a checkbox on the listing itself, not only inside a picker', async ({ page }) => {
    // The regression this feature turns on. Document checkboxes used to render only while a picker
    // window was open, because the listing had no bulk action of its own to select towards.
    await createDocument(page, first)
    await openCollection(page)

    await expect(await documentCheckbox(page, first)).toBeVisible({ timeout: SLOW })
  })

  test('shows the delete control only once something is selected', async ({ page }) => {
    await createDocument(page, first)
    await openCollection(page)
    await expect(row(page, first).first()).toBeVisible({ timeout: SLOW })

    await expect(deleteButton(page)).toHaveCount(0)

    await (await documentCheckbox(page, first)).click()
    await expect(deleteButton(page)).toBeVisible()
  })

  test('deletes every selected document in one action', async ({ page }) => {
    await createDocument(page, first)
    await openCollection(page)
    await createDocument(page, second)
    await openCollection(page)
    await expect(row(page, first).first()).toBeVisible({ timeout: SLOW })
    await expect(row(page, second).first()).toBeVisible({ timeout: SLOW })

    await (await documentCheckbox(page, first)).click()
    await (await documentCheckbox(page, second)).click()

    // The count is asserted as well as the outcome: a bulk deletion that submitted only the last
    // item clicked would still delete something, and the second row would look like a listing that
    // had not refreshed.
    await deleteSelectedDocuments(page, '2 documents')

    await expect(row(page, first)).toHaveCount(0, { timeout: SLOW })
    await expect(row(page, second)).toHaveCount(0, { timeout: SLOW })
  })

  test('deselects a selected document, and the delete control goes with it', async ({ page }) => {
    await createDocument(page, first)
    await openCollection(page)
    await expect(row(page, first).first()).toBeVisible({ timeout: SLOW })

    const checkbox = await documentCheckbox(page, first)
    await checkbox.click()
    await expect(checkbox).toHaveAttribute('aria-pressed', 'true')

    await checkbox.click()
    await expect(checkbox).toHaveAttribute('aria-pressed', 'false')
    await expect(deleteButton(page)).toHaveCount(0)
  })

  test('keeps its checkbox clear of the row it selects', async ({ page }) => {
    // A row's first field starts at the left edge, so a checkbox overlaid on the corner sits on top
    // of the text — legible in neither direction. The box has a column of its own, which is what
    // "ends before the content begins" states without depending on a pixel width.
    await createDocument(page, first)
    await openCollection(page)
    await expect(row(page, first).first()).toBeVisible({ timeout: SLOW })

    const checkbox = await (await documentCheckbox(page, first)).boundingBox()
    const content = await row(page, first).first().boundingBox()

    expect(checkbox).not.toBeNull()
    expect(content).not.toBeNull()
    expect(checkbox!.x + checkbox!.width).toBeLessThanOrEqual(content!.x)
  })

  test('does not move the delete control under a second click on select all', async ({ page }) => {
    // Reported from use: the toolbar is anchored to the right, so a control that appears extends it
    // leftwards. With delete ordered after select-all, the trash button landed exactly where the
    // cursor had just clicked, and a double click deleted the whole listing.
    await createDocument(page, first)
    await openCollection(page)
    await expect(row(page, first).first()).toBeVisible({ timeout: SLOW })

    const selectAll = await page.getByRole('button', { name: 'Select all' }).boundingBox()
    await page.getByRole('button', { name: 'Select all' }).click()

    const unselectAll = await page.getByRole('button', { name: 'Unselect all' }).boundingBox()
    const trash = await deleteButton(page).boundingBox()

    expect(selectAll).not.toBeNull()
    // The control under that spot is still the one that clears the selection, not the one that
    // destroys it.
    expect(unselectAll!.x).toBeCloseTo(selectAll!.x, 0)
    expect(trash!.x + trash!.width).toBeLessThanOrEqual(selectAll!.x)
  })

  test('selects and clears the whole listing from the toolbar', async ({ page }) => {
    await createDocument(page, first)
    await openCollection(page)
    await expect(row(page, first).first()).toBeVisible({ timeout: SLOW })

    // Deliberately never followed by a deletion: this listing holds documents this suite did not
    // create. What is asserted is that the control reaches the fixture row and that clearing works.
    await page.getByRole('button', { name: 'Select all' }).click()
    await expect(await documentCheckbox(page, first)).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Unselect all' }).click()
    await expect(await documentCheckbox(page, first)).toHaveAttribute('aria-pressed', 'false')
    await expect(deleteButton(page)).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------------------------
// The storage browser
// ---------------------------------------------------------------------------------------------

/** Deletes the current selection, confirming the counts it reads out. */
const deleteSelectedObjects = async (page: Page, expectedPhrase: string): Promise<void> => {
  await deleteButton(page).click()
  await expect(page.getByText(`Do you want to delete ${expectedPhrase}?`)).toBeVisible()
  await confirm(page)
  await expect(page.getByText('Deleted', { exact: true }).first()).toBeVisible({ timeout: SLOW })
}

test.describe('selecting stored objects', () => {
  let directory: string

  test.beforeEach(async ({ page }) => {
    directory = fixtureName('dir')
    await signIn(page)
  })

  test.afterEach(async ({ page }) => {
    // Removing the directory removes whatever is left inside it.
    await openBucketRoot(page)
    if (await card(page, directory).count() === 0) return

    await selectItem(page, directory)
    await deleteSelectedObjects(page, 'one directory')
    await notListed(page, directory)
  })

  test('deletes several files in one action', async ({ page }) => {
    await openBucketRoot(page)
    await createDirectory(page, directory)
    await card(page, directory).click()
    await uploadFile(page, 'first.txt')
    await uploadFile(page, 'second.txt')

    await selectItem(page, 'first.txt')
    await selectItem(page, 'second.txt')
    await deleteSelectedObjects(page, '2 files')

    await notListed(page, 'first.txt')
    await expect(card(page, 'second.txt')).toHaveCount(0)
  })

  test('counts directories and files separately in the confirmation', async ({ page }) => {
    await openBucketRoot(page)
    await createDirectory(page, directory)
    await card(page, directory).click()
    await uploadFile(page, 'first.txt')
    await createDirectory(page, 'nested')

    await selectItem(page, 'nested')
    await selectItem(page, 'first.txt')

    // The wording is the whole point: a deletion that said "2 items" would not tell the user a
    // directory — and everything under it — is about to go.
    await deleteSelectedObjects(page, 'one directory and one file')
    await notListed(page, 'first.txt')
  })

  test('selects and clears everything in the directory from the toolbar', async ({ page }) => {
    await openBucketRoot(page)
    await createDirectory(page, directory)
    await card(page, directory).click()
    await uploadFile(page, 'first.txt')
    await uploadFile(page, 'second.txt')

    // Safe only because this is the fixture's own directory: at a bucket root the same control
    // would reach real content.
    await page.getByRole('button', { name: 'Select all' }).click()
    await expect(itemCheckbox(page, 'first.txt')).toHaveAttribute('aria-pressed', 'true')
    await expect(itemCheckbox(page, 'second.txt')).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Unselect all' }).click()
    await expect(itemCheckbox(page, 'first.txt')).toHaveAttribute('aria-pressed', 'false')
    await expect(deleteButton(page)).toHaveCount(0)
  })

  test('does not move the delete control under a second click on select all', async ({ page }) => {
    // The storage toolbar already orders these correctly. Asserted here so that it stays that way:
    // the collection listing had the same controls in the opposite order, and a second click in the
    // same spot deleted everything selected.
    await openBucketRoot(page)
    await createDirectory(page, directory)
    await card(page, directory).click()
    await uploadFile(page, 'first.txt')

    const selectAll = await page.getByRole('button', { name: 'Select all' }).boundingBox()
    await page.getByRole('button', { name: 'Select all' }).click()

    const unselectAll = await page.getByRole('button', { name: 'Unselect all' }).boundingBox()
    expect(unselectAll!.x).toBeCloseTo(selectAll!.x, 0)

    await page.getByRole('button', { name: 'Unselect all' }).click()
  })

  test('deselects at the cap, so a full selection can be undone', async ({ page }) => {
    // The defect the shared core removed, asserted through the interface it broke: the old storage
    // selection tested the cap *before* the toggle, so at the limit no checkbox responded at all.
    // The browser imposes no cap, so what is asserted here is that a selected item stays clickable
    // and really deselects.
    await openBucketRoot(page)
    await createDirectory(page, directory)
    await card(page, directory).click()
    await uploadFile(page, 'first.txt')

    await selectItem(page, 'first.txt')
    await expect(itemCheckbox(page, 'first.txt')).toHaveAttribute('aria-pressed', 'true')

    await selectItem(page, 'first.txt')
    await expect(itemCheckbox(page, 'first.txt')).toHaveAttribute('aria-pressed', 'false')

    await listed(page, 'first.txt')
  })
})
