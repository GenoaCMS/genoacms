import { expect, test } from '@playwright/test'

/**
 * Unauthenticated smoke tests.
 *
 * These need a built app, and `vite build` for core authenticates against the
 * configured provider — so they only run where genoa.config credentials are
 * present. See tests/README.md.
 */

test('the landing page renders', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Welcome to\s*GenoaCMS/ })).toBeVisible()
})

test('the landing page links to login', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Login' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('the login form asks for a username and password', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('input[name="username"]')).toBeVisible()
  await expect(page.locator('input[name="password"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
})

test('the admin area is not reachable without a session', async ({ page }) => {
  // (admin)/+layout.server.ts redirects to / when locals.user is unset
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/$/)
})
