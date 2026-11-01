import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { Locator, Page } from 'playwright'
import { startServer, type RunningServer, type User } from './server'
import { enabled, removeInstance } from './bucket'
import { launchBrowser, closeBrowser, signedInSession, type Session } from './browser'

const password = (): string => randomBytes(18).toString('base64url')
const run = randomBytes(4).toString('hex')

const ada: User = { subject: 'e2e-ada', email: 'ada@e2e.test', password: password() }

const SETUP_TIMEOUT_MS = 300_000
const TEARDOWN_TIMEOUT_MS = 120_000
const TEST_TIMEOUT_MS = 120_000
const SLOW_MS = 30_000

let server: RunningServer
let session: Session
let pageErrors: string[] = []

const shown = async (locator: Locator): Promise<void> => { await locator.first().waitFor({ state: 'visible', timeout: SLOW_MS }) }
const toast = (page: Page, text: string): Locator => page.getByText(text, { exact: true })

/** Navigates, then waits until the page has hydrated, so a click lands on the live page. */
async function visit (page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
}

async function register (page: Page, name: string, kind: 'Already coded in my app' | 'Code it here'): Promise<string> {
  await visit(page, '/components/registrar')
  await page.getByRole('button', { name: 'Register component' }).click()
  const dialog = page.getByRole('dialog', { name: 'Register a new component' })
  await dialog.getByLabel('Component name:').fill(name)
  await dialog.getByRole('radio', { name: kind }).check()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL(/\/components\/registrar\/[^/]+$/, { timeout: SLOW_MS })
  return new URL(page.url()).pathname.split('/').pop() ?? ''
}

async function writeBody (page: Page, uid: string, body: string): Promise<void> {
  await visit(page, `/components/editor/${uid}`)
  const editor = page.locator('.cm-content').first()
  await shown(editor)
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(body)
}

describe.skipIf(!enabled).sequential('the component remote forms through the running server', { timeout: TEST_TIMEOUT_MS }, () => {
  beforeAll(async () => {
    await removeInstance()
    server = await startServer({ primary: [ada] })
    await launchBrowser()
    session = await signedInSession(server, ada)
    session.page.on('pageerror', error => { pageErrors.push(error.message) })
  }, SETUP_TIMEOUT_MS)

  afterAll(async () => {
    await closeBrowser()
    await server?.stop()
    await removeInstance()
  }, TEARDOWN_TIMEOUT_MS)

  beforeEach(() => {
    pageErrors = []
  })

  it('PUB-1, PUB-6: a note typed into the registrar\'s dialog publishes the component', async () => {
    const { page } = session
    await register(page, `E2E published ${run}`, 'Already coded in my app')
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Publish the component' })
    await dialog.getByPlaceholder('Describe what you are releasing...').pressSequentially('published by e2e')
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click()

    await shown(toast(page, 'Component published'))
    expect(pageErrors).toStrictEqual([])
  })

  it('SRC-4: a body saved from the editor is stored and read back', async () => {
    const { page } = session
    const uid = await register(page, `E2EStored${run}`, 'Code it here')
    await writeBody(page, uid, "return 'stored'")
    await page.getByRole('button', { name: 'Save' }).click()
    await shown(toast(page, 'Code saved'))

    await visit(page, `/components/editor/${uid}`)
    await shown(page.locator('.cm-content').getByText("return 'stored'"))
    expect(pageErrors).toStrictEqual([])
  })

  it('CMP-9: a dynamic component is deleted from the editor once its name is typed', async () => {
    const { page } = session
    const name = `E2EDeleted${run}`
    const uid = await register(page, name, 'Code it here')
    await visit(page, `/components/editor/${uid}`)
    await page.getByRole('button', { name: 'Delete component' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete the component' })
    await dialog.getByRole('textbox').pressSequentially(name)
    await dialog.getByRole('button', { name: `Yes, delete ${name}` }).click()

    await shown(toast(page, 'Component deleted'))
    await page.waitForURL(url => url.pathname === '/components/editor', { timeout: SLOW_MS })
    expect(pageErrors).toStrictEqual([])
  })
})
