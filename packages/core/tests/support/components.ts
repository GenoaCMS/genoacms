import { expect, type Page } from '@playwright/test'

/**
 * Driving the component registrar, for suites whose subject is something else.
 *
 * `components.spec.ts` owns the registrar as a *subject* and drives it in its own terms. What lives
 * here is the registrar as a **fixture**: what a page suite has to do before it can compose anything.
 *
 * Shared rather than copied because publishing became a precondition of two suites at once. A page is
 * composed only from components that have been published, so every suite that builds a page now has
 * to register and release one first — and two suites each keeping their own idea of what "published"
 * involves will eventually disagree, with the one that is wrong looking like a product defect.
 */

/** Registers a prebuilt component and lands on its registrar page. */
const registerComponent = async (page: Page, name: string): Promise<void> => {
  await page.goto('/components/registrar')
  await page.getByRole('button', { name: 'Register component' }).click()
  await page.getByLabel('Component name:').fill(name)
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(page.getByText(`Component: ${name}`)).toBeVisible()
}

/**
 * Publishes the component whose registrar page is open.
 *
 * Waits for the **badge** rather than the toast. The toast is transient and a suite that missed it
 * would fail describing a publication that actually succeeded; the badge is the state an author
 * reads, and it is what says the component is now usable on a page.
 */
const publishComponent = async (page: Page, timeout = 20_000): Promise<void> => {
  await page.getByRole('button', { name: 'Publish' }).click()
  const dialog = page.getByRole('dialog', { name: 'Publish the component' })
  await dialog.getByRole('textbox').last().fill('published by the end-to-end suite')
  await dialog.getByRole('button', { name: /publish/i }).click()

  await expect(page.getByText('Published', { exact: true })).toBeVisible({ timeout })
}

/** A component a page may be composed from: registered, and released. */
const registerPublishedComponent = async (page: Page, name: string): Promise<void> => {
  await registerComponent(page, name)
  await publishComponent(page)
}

/** Removes a component by name, through the registrar's own bulk selection. */
const removeComponent = async (page: Page, name: string, timeout = 20_000): Promise<void> => {
  await page.goto('/components/registrar')
  const box = page.getByRole('button', { name: `select-${name}` })
  if (await box.count() === 0) return

  await box.first().click()
  await page.getByRole('button', { name: 'Delete selected' }).click()
  const phrase = (await page.locator('code').innerText()).trim()
  await page.locator('input[name="confirmation"]').fill(phrase)
  await page.getByRole('button', { name: /^Yes, delete/ }).click()

  await expect(page.getByRole('button', { name: `select-${name}` })).toHaveCount(0, { timeout })
}

export { registerComponent, publishComponent, registerPublishedComponent, removeComponent }
