import { test, expect, type Page } from '@playwright/test'
import { signIn } from './support/session'
import { PREFIX, COMPONENTS, PAGES } from './support/demo'

/**
 * Removing everything `demoFixtures.spec.ts` published.
 *
 * **Separate on purpose.** A demo is worth leaving standing between sessions, so creating and
 * removing are two scenarios rather than a setup and a teardown. Running the fixtures twice without
 * this in between leaves duplicates, which is the cost of that choice and is stated here rather than
 * discovered.
 *
 * ## Pages first, and it matters
 *
 * A component that a **published page pins cannot be deleted** — the CMS refuses it, by name, from
 * below every surface that deletes. So removing components first fails on all four at once and
 * leaves the instance exactly as it was, which reads like a broken cleanup rather than the rule
 * working. The order here is the rule, not a preference.
 *
 * ## What it removes, and what it will not
 *
 * Only what carries the `demo` prefix. The end-to-end suites own `e2e…` and sweep their own; nothing
 * here touches anything else, because an instance is somebody's real content and a cleanup that
 * guesses is a cleanup that deletes.
 */

const SLOW = 30_000

/**
 * Waits for a list screen to have rendered before anything is counted on it.
 *
 * **Without this the cleanup silently does nothing.** Both helpers below treat "no checkbox" as
 * "already gone", which is right — a cleanup that failed on what was already removed could never be
 * run twice, and the second run is exactly when it is needed. But `count()` immediately after a
 * navigation answers zero for a list that has not painted yet, and the two are indistinguishable.
 * Observed: two of four components survived a green-looking run.
 */
const listReady = async (page: Page, control: string): Promise<void> => {
  await expect(page.getByRole('button', { name: control })).toBeVisible({ timeout: SLOW })
}

/** Deletes a page through the page list's own selection, if it is there at all. */
const removePage = async (page: Page, name: string): Promise<void> => {
  await page.goto('/components/pages')
  await listReady(page, 'Create page')
  const box = page.getByRole('button', { name: new RegExp(`^select-.*${name}`) })
  if (await box.count() === 0) return

  await box.first().click()
  await page.getByRole('button', { name: 'Delete selected' }).click()
  const phrase = (await page.locator('code').innerText()).trim()
  await page.locator('input[name="confirmation"]').fill(phrase.split(',')[0])
  await page.getByRole('button', { name: /^Yes, delete/ }).click()

  await expect(page.getByRole('button', { name: new RegExp(`^select-.*${name}`) }))
    .toHaveCount(0, { timeout: SLOW })
}

/** Deletes a component through the registrar's own bulk selection, if it is there at all. */
const removeComponent = async (page: Page, name: string): Promise<void> => {
  await page.goto('/components/registrar')
  await listReady(page, 'Register component')
  const box = page.getByRole('button', { name: `select-${name}` })
  if (await box.count() === 0) return

  await box.first().click()
  await page.getByRole('button', { name: 'Delete selected' }).click()
  const phrase = (await page.locator('code').innerText()).trim()
  await page.locator('input[name="confirmation"]').fill(phrase.split(',')[0])
  await page.getByRole('button', { name: /^Yes, delete/ }).click()

  await expect(page.getByRole('button', { name: `select-${name}` }))
    .toHaveCount(0, { timeout: SLOW })
}

test.describe('@demo removing the demo content', () => {
  test.describe.configure({ mode: 'serial', retries: 0 })

  test.beforeEach(async ({ page }) => {
    await signIn(page)
  })

  test('removes the demo pages', async ({ page }) => {
    test.setTimeout(180_000)

    for (const name of Object.values(PAGES)) {
      await removePage(page, name)
    }

    await page.goto('/components/pages')
    for (const name of Object.values(PAGES)) {
      await expect(page.getByText(name, { exact: true })).toHaveCount(0)
    }
  })

  test('removes the demo components, which the pages no longer pin', async ({ page }) => {
    /*
     * **This is also the assertion that the refusal is real.** If a page above had survived, every
     * deletion here would be refused with the pages named — so a green run says both that the
     * components are gone and that nothing was still depending on them.
     */
    test.setTimeout(240_000)

    for (const component of Object.values(COMPONENTS)) {
      await removeComponent(page, component.name)
    }

    await page.goto('/components/registrar')
    for (const component of Object.values(COMPONENTS)) {
      await expect(page.getByText(component.name, { exact: true })).toHaveCount(0)
    }
  })

  test('leaves nothing behind carrying the demo prefix', async ({ page }) => {
    // A component created by an interrupted fixtures run carries the prefix and is not in the list
    // above, so the named removals would miss it. This is what notices.
    await page.goto('/components/registrar')
    await expect(page.getByText(new RegExp(`\\b${PREFIX}[A-Z]`))).toHaveCount(0)

    await page.goto('/components/pages')
    await expect(page.getByText(new RegExp(`\\b${PREFIX}[A-Z]`))).toHaveCount(0)
  })
})
