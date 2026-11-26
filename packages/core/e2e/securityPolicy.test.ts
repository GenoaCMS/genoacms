import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { Locator, Page } from 'playwright'
import { startServer, type RunningServer, type User } from './server'
import { enabled, removeInstance, writeObject } from './bucket'
import { launchBrowser, closeBrowser, signedInSession, visit, type Session } from './browser'
import { readStoredJSON } from './signing'

const password = (): string => randomBytes(18).toString('base64url')
const run = randomBytes(4).toString('hex')

const ada: User = { subject: 'e2e-ada', email: 'ada@e2e.test', password: password() }

const SETUP_TIMEOUT_MS = 300_000
const TEARDOWN_TIMEOUT_MS = 120_000
const TEST_TIMEOUT_MS = 180_000
const SLOW_MS = 30_000
const POLICY_PATH = '.genoacms/security/policy.json'
const UNREADABLE = 'The stored policy could not be read: '
const CONSEQUENCE = 'Until it is rewritten, sign-in runs on the strictest token lifetimes and nothing can be published. The values below are the defaults from genoa.config. Saving here replaces the stored document.'

let server: RunningServer
let session: Session | undefined

const shown = async (locator: Locator): Promise<void> => { await locator.first().waitFor({ state: 'visible', timeout: SLOW_MS }) }
const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name })

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')

async function closeSession (): Promise<void> {
  await session?.context.close()
  session = undefined
}

async function signIn (): Promise<Page> {
  await closeSession()
  session = await signedInSession(server, ada)
  return session.page
}

async function openSecurity (page: Page): Promise<void> {
  await visit(page, '/configuration/security')
  await shown(page.getByRole('heading', { name: 'Security policy' }))
}

async function savePolicy (page: Page): Promise<void> {
  await openSecurity(page)
  await button(page, 'Save').click()
  await shown(page.getByText('Policy saved'))
  await page.waitForLoadState('networkidle')
}

async function registerPrebuilt (page: Page, name: string): Promise<void> {
  await visit(page, '/components/registrar')
  await button(page, 'Register component').click()
  const dialog = page.getByRole('dialog', { name: 'Register a new component' })
  await dialog.getByLabel('Component name:').fill(name)
  await dialog.getByRole('radio', { name: 'Already coded in my app' }).check()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL(/\/components\/registrar\/[^/]+$/, { timeout: SLOW_MS })
  await shown(page.getByText(`Component: ${name}`))
}

async function publish (page: Page): Promise<void> {
  await button(page, 'Publish').click()
  const dialog = page.getByRole('dialog', { name: 'Publish the component' })
  await dialog.getByRole('textbox').last().pressSequentially('published by the end-to-end suite')
  await dialog.getByRole('button', { name: /publish/i }).click()
}

const storedPolicyText = async (): Promise<string> => JSON.stringify(await readStoredJSON(POLICY_PATH))

describe.skipIf(!enabled).sequential('a damaged security policy through the running server', { timeout: TEST_TIMEOUT_MS }, () => {
  beforeAll(async () => {
    await removeInstance()
    server = await startServer({ primary: [ada] })
    await launchBrowser()
  }, SETUP_TIMEOUT_MS)

  afterAll(async () => {
    await closeSession()
    await closeBrowser()
    await server?.stop()
    await removeInstance()
  }, TEARDOWN_TIMEOUT_MS)

  it('YJ4a, POL-3: a damaged policy keeps sign-in working and stops publishing until it is rewritten', async () => {
    await writeObject(POLICY_PATH, '{}')

    const page = await signIn()
    expect(new URL(page.url()).pathname).toBe('/dashboard')

    await openSecurity(page)
    await shown(page.getByText(new RegExp(`^${escaped(UNREADABLE)}\\S`)))
    await shown(page.getByText(CONSEQUENCE, { exact: true }))

    const component = `E2EPolicy${run}a`
    await registerPrebuilt(page, component)
    const registrar = new URL(page.url()).pathname
    await publish(page)
    await shown(page.getByText(/security-policy\/damaged: .+\. An administrator must rewrite it on \/configuration\/security\./))

    await savePolicy(page)
    await openSecurity(page)
    expect(await page.getByText(UNREADABLE).count()).toBe(0)
    expect(await page.getByText(CONSEQUENCE).count()).toBe(0)

    await visit(page, registrar)
    await publish(page)
    await shown(page.getByText('Component published', { exact: true }))
  })

  it('YJ4b, POL-2, POL-3: a restored older policy is damaged', async () => {
    const page = await signIn()
    await savePolicy(page)
    const older = await storedPolicyText()
    const { payload } = JSON.parse(older) as { payload: { sequence: number } }

    await savePolicy(page)
    await writeObject(POLICY_PATH, older)

    await openSecurity(page)
    await shown(page.getByText(
      `${UNREADABLE}policy-rollback: sequence ${payload.sequence} is below the highest seen (${payload.sequence + 1})`
    ))
  })
})
