import { expect, type Locator, type Page } from '@playwright/test'
import credentials from '../../genoa.config/gcp/authCredentials.js'

/**
 * Shared helpers for the authenticated end-to-end suites.
 *
 * Every suite past `smoke.spec.ts` needs a session and a way to name fixtures, so both live here
 * rather than being copied per file — a second copy is how two suites end up disagreeing about what
 * "signed in" means.
 */

const [account] = credentials

/**
 * The prefix every fixture these suites create carries.
 *
 * The suites run against real buckets and a real Firestore. Nothing without this prefix is ever
 * selected, renamed or deleted, so a test can only destroy what it made. Anything left behind by an
 * interrupted run is identifiable at a glance and safe to remove by hand.
 */
const FIXTURE_PREFIX = 'e2e-'

/** A fixture name unique to one test, so parallel or repeated runs cannot collide. */
const fixtureName = (what: string): string =>
  `${FIXTURE_PREFIX}${what}-${Math.random().toString(36).slice(2, 8)}`

const signIn = async (page: Page): Promise<void> => {
  await page.goto('/login')
  await page.locator('input[name="username"]').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}

/**
 * Confirms the "are you sure?" dialog.
 *
 * Destructive actions route through one shared confirmation, so the wording lives in one place here
 * too.
 */
const confirm = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Yes' }).click()
}

/** A toast reporting the outcome of an action, which most screens use instead of navigating. */
const toast = (page: Page, text: string | RegExp): Locator =>
  page.getByText(text).first()

export {
  account,
  FIXTURE_PREFIX,
  fixtureName,
  signIn,
  confirm,
  toast
}
