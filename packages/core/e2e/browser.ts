import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import type { RunningServer, User } from './server'

export interface Session {
  context: BrowserContext
  page: Page
}

let browser: Browser | undefined

export async function launchBrowser (): Promise<void> {
  browser ??= await chromium.launch()
}

export async function closeBrowser (): Promise<void> {
  await browser?.close()
  browser = undefined
}

/**
 * A fresh browser context signed in through the login form, on the dashboard.
 *
 * Leaving a page through `page.goto` always goes ahead: a `beforeunload` prompt is accepted. Every
 * other dialog is left to the test.
 */
export async function signedInSession (server: RunningServer, user: User): Promise<Session> {
  if (browser === undefined) throw new Error('launchBrowser first')
  const context = await browser.newContext({ baseURL: server.origin })
  const page = await context.newPage()
  page.on('dialog', async dialog => { if (dialog.type() === 'beforeunload') await dialog.accept() })
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(user.email)
  await page.getByPlaceholder('Password').fill(user.password)
  await Promise.all([
    page.waitForURL('**/dashboard'),
    page.getByRole('button', { name: 'Login' }).click()
  ])
  return { context, page }
}
