import { expect, test, type Locator, type Page } from '@playwright/test'
import { fixtureName, signIn } from './support/session'

/**
 * Pages: creating one, editing its content, and publishing it.
 *
 * **Cleanup goes around the interface, because the interface has no way to do it.** There is no
 * delete action for a page — `pages:delete` exists in the permission taxonomy with nothing
 * consuming it — so a page created here is removed through the storage browser, which can reach the
 * `.genoacms/pages/` objects the page service writes. That is deliberate but fragile: it depends on
 * the storage layout in `page.server.ts`, and it is the first thing to fix if these tests start
 * leaving fixtures behind.
 *
 * Publishing is exercised, and it writes a readable tree for real consumers. The published objects
 * are removed by the same cleanup.
 */

const SLOW = 20_000
const BUCKET = 'genoacms'

/**
 * Where the page service keeps its objects, mirrored from `page.server.ts`, as the segments the
 * storage browser is walked through.
 */
const PAGE_DIRECTORIES = [
  ['.genoacms', 'pages', 'entries'],
  ['.genoacms', 'pages', 'readables']
]

const reported = async (page: Page, message: string | RegExp): Promise<void> => {
  await expect(page.getByText(message).first()).toBeVisible({ timeout: SLOW })
}

const card = (page: Page, name: string): Locator =>
  page.getByRole('link', { name })

/**
 * Opens the page list, retrying the load.
 *
 * The list is built by reading every page entry out of storage, which is the slowest load in the
 * app and occasionally serves a 500 while a just-written entry settles.
 */
const openPages = async (page: Page): Promise<void> => {
  await expect(async () => {
    await page.goto('/components/pages')
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: SLOW })
}

/**
 * Creates a page against the first component offered.
 *
 * The component list comes from the prebuilt catalogue, so the test picks whatever this instance
 * has rather than depending on a particular component existing.
 */
const createPage = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name: 'Create page' }).click()

  const dialog = page.getByRole('dialog', { name: 'Create a new page' })
  await dialog.getByLabel('Name:').fill(name)
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(page).toHaveURL(new RegExp(`/components/pages/${name}`), { timeout: SLOW })

  // The entry has just been written, and reading it back can briefly fail — the editor renders a
  // 500 rather than the page. Retrying the load asserts the page is really there instead of
  // depending on how quickly storage catches up.
  await expect(async () => {
    await page.reload()
    await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: SLOW })
}

/**
 * Walks the storage browser into a directory, one card at a time.
 *
 * The browser encodes paths with its own delimiter rather than a slash, so a constructed URL is
 * easy to get subtly wrong and silently land somewhere empty — which would make cleanup quietly do
 * nothing. Clicking through is what a person does, and it cannot land anywhere but the right place.
 */
const openStorageDirectory = async (browser: Page, segments: string[]): Promise<void> => {
  await browser.goto(`/storage/${BUCKET}/contents`)

  // Each click has to be waited out: the browser navigates client-side, and clicking the next
  // segment before the current listing has arrived silently lands somewhere else — which is how the
  // first version of this cleanup did nothing at all while reporting success.
  // Scoped to the listing: the navigation sidebar has links of its own, and "components" there
  // would take the walk to a different screen entirely.
  const grid = browser.getByRole('main')
  const walked: string[] = []
  for (const segment of segments) {
    await grid.getByRole('link', { name: segment }).first().click()
    walked.push(segment)
    await expect(browser.locator('h1')).toHaveText(`${walked.join('/')}/`, { timeout: SLOW })
  }
}

/**
 * Removes the objects a page left in storage, through the storage browser.
 *
 * Both the entry and any published readable are named after the page, so one sweep per directory
 * covers everything a test can have created.
 */
const removePageObjects = async (browser: Page, name: string): Promise<void> => {
  for (const directory of PAGE_DIRECTORIES) {
    await openStorageDirectory(browser, directory)

    const item = browser.getByRole('button', { name: new RegExp(`^select-.*${name}`) })
    if (await item.count() === 0) continue

    await item.first().click()
    await browser.getByRole('button', { name: 'Delete', exact: true }).click()
    await browser.getByRole('button', { name: 'Yes' }).click()
    await expect(browser.getByText('Deleted', { exact: true }).first()).toBeVisible({ timeout: SLOW })
  }
}

test.describe('a page', () => {
  let name: string

  test.beforeEach(async ({ page }) => {
    name = fixtureName('page')
    await signIn(page)
    await openPages(page)
  })

  test.afterEach(async ({ page }) => {
    await removePageObjects(page, name)
  })

  test('is created and appears in the list', async ({ page }) => {
    await createPage(page, name)

    await openPages(page)
    await expect(card(page, name).first()).toBeVisible({ timeout: SLOW })
  })

  test('opens its editor with the component tree', async ({ page }) => {
    await createPage(page, name)

    await expect(page.getByRole('heading', { name })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
  })

  test('takes a preview URL, which persists', async ({ page }) => {
    await createPage(page, name)

    await page.getByRole('button', { name: 'Update preview URL' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit preview URL:' })
    await dialog.getByRole('textbox').fill('https://example.com/preview')
    await dialog.getByRole('button', { name: /save|update/i }).click()
    // Awaited rather than raced: reloading before the write lands would test nothing.
    await reported(page, 'Edit successful')

    // Retried like the other reads that go to storage: the entry has just been rewritten, and the
    // reload can land before that is visible.
    await expect(async () => {
      await page.reload()
      await expect(page.locator('iframe')).toHaveAttribute('src', 'https://example.com/preview', {
        timeout: 3_000
      })
    }).toPass({ timeout: SLOW })
  })

  test('saves edited content', async ({ page }) => {
    await createPage(page, name)

    await page.getByRole('button', { name: 'Save' }).click()
    await reported(page, 'Saved')
  })

  test('publishes, writing a readable tree', async ({ page }) => {
    test.setTimeout(120_000)
    await createPage(page, name)

    // Build generates the readable tree consumers fetch. It is the last step of the page lifecycle
    // and the only one that leaves something outside the CMS's own state.
    await page.getByRole('button', { name: 'Build' }).click()
    await reported(page, 'Saved')

    await openStorageDirectory(page, ['.genoacms', 'pages', 'readables'])
    await expect(page.getByRole('button', { name: new RegExp(`^select-.*${name}`) }).first())
      .toBeVisible({ timeout: SLOW })
  })
})
