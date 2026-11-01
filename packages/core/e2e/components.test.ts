import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { Locator, Page } from 'playwright'
import { startServer, type RunningServer, type User } from './server'
import runtime from '@genoacms/adapter-gcp/storage/runtime'
import { enabled, removeInstance } from './bucket'
import { launchBrowser, closeBrowser, signedInSession, type Session } from './browser'

const password = (): string => randomBytes(18).toString('base64url')
const run = randomBytes(4).toString('hex')

const ada: User = { subject: 'e2e-ada', email: 'ada@e2e.test', password: password() }

const SETUP_TIMEOUT_MS = 300_000
const TEARDOWN_TIMEOUT_MS = 120_000
const TEST_TIMEOUT_MS = 120_000
const SLOW_MS = 30_000
const PROJECT = process.env.GENOACMS_TEST_GCP_PROJECT ?? 'genoacms'
const BUCKET = process.env.GENOACMS_TEST_GCP_BUCKET ?? 'genoacms-tests'
const NO_SUCH_COMPONENT = '00000000-0000-4000-8000-000000000000'

let server: RunningServer
let session: Session
let pageErrors: string[] = []

const shown = async (locator: Locator): Promise<void> => { await locator.first().waitFor({ state: 'visible', timeout: SLOW_MS }) }
const toast = (page: Page, text: string): Locator => page.getByText(text, { exact: true })
const reported = async (page: Page, text: string | RegExp): Promise<void> => { await shown(page.getByText(text)) }
const card = (page: Page, name: string): Locator => page.getByRole('link', { name })
const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name })

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

async function registerPrebuilt (page: Page, name: string): Promise<string> {
  const uid = await register(page, name, 'Already coded in my app')
  await visit(page, `/components/registrar/${uid}`)
  return uid
}

async function registerDynamic (page: Page, name: string): Promise<string> {
  const uid = await register(page, name, 'Code it here')
  await visit(page, `/components/registrar/${uid}`)
  return uid
}

async function rename (page: Page, to: string): Promise<void> {
  await button(page, 'Change name').click()
  const dialog = page.getByRole('dialog', { name: 'Change name' })
  await dialog.getByRole('textbox').pressSequentially(to)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await reported(page, /updated|saved/i)
}

async function addAttribute (page: Page, type: string): Promise<void> {
  await button(page, 'Add attribute').click()
  const dialog = page.getByRole('dialog', { name: 'New attribute' })
  await dialog.getByRole('button', { name: type }).first().click()
}

async function submitHeader (page: Page): Promise<void> {
  await button(page, 'Submit').click()
}

async function publishRegistered (page: Page): Promise<void> {
  await button(page, 'Publish').click()
  const dialog = page.getByRole('dialog', { name: 'Publish the component' })
  await dialog.getByRole('textbox').last().pressSequentially('published by the end-to-end suite')
  await dialog.getByRole('button', { name: /publish/i }).click()
}

async function saveBody (page: Page): Promise<void> {
  await button(page, 'Save').click()
  await reported(page, 'Code saved')
}

async function openEditor (page: Page): Promise<void> {
  await visit(page, '/components/editor')
  await shown(page.getByRole('heading', { name: 'Component editor' }))
}

async function openCode (page: Page, uid: string): Promise<void> {
  await visit(page, `/components/editor/${uid}`)
  await shown(page.locator('.cm-content'))
}

async function writeAndSave (page: Page, body: string): Promise<void> {
  const editor = page.locator('.cm-content').first()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(body)
  await saveBody(page)
}

async function publishedObjects (uid: string): Promise<string[]> {
  const storage = await runtime.create({ projectId: PROJECT }, { name: 'e2e', resources: [BUCKET] })
  const { files, directories } = await storage.listDirectory({ bucket: BUCKET, name: `.genoacms/components/public/${uid}/` })
  return [...files.map(file => file.name), ...directories.map(directory => directory.name)]
}

async function selectNamed (page: Page, names: string[]): Promise<void> {
  const boxes = page.locator(names.map(name => `button[aria-label="select-${name}"]`).join(', '))
  await expect.poll(async () => await boxes.count(), { timeout: SLOW_MS }).toBe(names.length)
  for (const box of await boxes.all()) await box.click()
  await button(page, 'Delete selected').click()
}

async function confirmationPhrase (page: Page): Promise<string> {
  return (await page.locator('code').innerText()).trim()
}

async function absentFrom (page: Page, url: string, names: string[]): Promise<void> {
  await expect.poll(async () => {
    await visit(page, url)
    let present = 0
    for (const name of names) present += await card(page, name).count()
    return present
  }, { timeout: SLOW_MS, interval: 500 }).toBe(0)
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
  it('CMP-6, CMP-7: a registered prebuilt component appears in the catalog', async () => {
    const { page } = session
    const name = `E2EPrebuilt${run}a`
    await registerPrebuilt(page, name)

    await visit(page, '/components/registrar')
    await shown(card(page, name))
  })

  it('CMP-8, CMP-7: a prebuilt component can be renamed, and the new name persists', async () => {
    const { page } = session
    const name = `E2EPrebuilt${run}b`
    await registerPrebuilt(page, name)

    const renamed = `${name}-renamed`
    await rename(page, renamed)

    await page.reload()
    await shown(page.getByText(`Component: ${renamed}`))
  })

  it('PUB-1, PUB-5, PUB-6: a prebuilt component publishes a signed header, and no executable', async () => {
    const { page } = session
    const uid = await registerPrebuilt(page, `E2EPrebuilt${run}c`)
    await shown(page.getByText('Unpublished'))

    await publishRegistered(page)
    await reported(page, 'Component published')
    await shown(page.getByText('Published', { exact: true }))

    await expect.poll(async () => (await publishedObjects(uid)).length, { timeout: SLOW_MS }).toBe(1)
    expect((await publishedObjects(uid))[0]).toMatch(/[0-9a-f-]{36}\.json$/)
  })

  it('PUB-2: publishing twice with nothing changed is refused', async () => {
    const { page } = session
    await registerPrebuilt(page, `E2EPrebuilt${run}d`)

    await publishRegistered(page)
    await reported(page, 'Component published')
    await page.getByText('Component published').first().waitFor({ state: 'detached', timeout: SLOW_MS })

    await publishRegistered(page)
    await reported(page, /Nothing has changed/)
  })

  it('CMP-3, CMP-8: a prebuilt component takes an attribute, which survives saving', async () => {
    const { page } = session
    await registerPrebuilt(page, `E2EPrebuilt${run}e`)

    await addAttribute(page, 'string')
    await submitHeader(page)
    await reported(page, /updated|saved/i)

    await page.reload()
    await shown(page.getByRole('textbox'))
  })

  it('HIS-1, CMP-8: undo is enabled as soon as a change is saved, without a reload', async () => {
    const { page } = session
    const name = `E2EPrebuilt${run}f`
    await registerPrebuilt(page, name)

    await rename(page, `${name}-undone`)

    await expect.poll(async () => await button(page, 'Undo').isEnabled(), { timeout: SLOW_MS }).toBe(true)
  })

  it('HIS-1: a rename is undone, and redone, without leaving the page', async () => {
    const { page } = session
    const original = `E2EPrebuilt${run}g`
    const renamed = `${original}-undone`
    await registerPrebuilt(page, original)
    await rename(page, renamed)

    await page.reload()
    const undo = button(page, 'Undo')
    await expect.poll(async () => await undo.isEnabled(), { timeout: SLOW_MS }).toBe(true)

    await page.evaluate(() => { (window as unknown as Record<string, unknown>).kept = true })
    await undo.click()

    await page.getByText(`Component: ${renamed}`).waitFor({ state: 'hidden', timeout: SLOW_MS })
    await shown(page.getByText(`Component: ${original}`))
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).kept)).toBe(true)

    const redo = button(page, 'Redo')
    await expect.poll(async () => await redo.isEnabled(), { timeout: SLOW_MS }).toBe(true)
    await redo.click()
    await shown(page.getByText(`Component: ${renamed}`))
  })

  it('HIS-1: a component that was only just created has nothing to undo or redo', async () => {
    const { page } = session
    await registerPrebuilt(page, `E2EPrebuilt${run}h`)

    expect(await button(page, 'Undo').isDisabled()).toBe(true)
    expect(await button(page, 'Redo').isDisabled()).toBe(true)
  })

  it('CMP-3, CMP-8: a numeric constraint that was entered and then cleared is saved without a key', async () => {
    const { page } = session
    await registerPrebuilt(page, `E2EPrebuilt${run}i`)

    await addAttribute(page, 'number')
    const minimum = page.getByLabel('Minimum value:')
    await minimum.pressSequentially('5')
    await minimum.fill('')
    await submitHeader(page)
    await reported(page, /updated|saved/i)

    await page.reload()
    await expect.poll(async () => await page.getByLabel('Minimum value:').inputValue(), { timeout: SLOW_MS }).toBe('')
  })

  it('SRC-2: opening a component the editor has nothing to show answers 404', async () => {
    const { page } = session
    const response = await page.goto(`/components/editor/${NO_SUCH_COMPONENT}`)

    expect(response?.status()).toBe(404)
  })

  it('CMP-9: the registrar\'s Yes, delete stays disabled until the name is typed in full', async () => {
    const { page } = session
    const name = `E2EPrebuilt${run}x`
    await registerPrebuilt(page, name)

    await button(page, 'Delete component').click()
    const dialog = page.getByRole('dialog', { name: 'Delete the component' })
    const confirmation = dialog.getByRole('button', { name: `Yes, delete ${name}` })
    await dialog.getByRole('textbox').pressSequentially(name.slice(0, -1))
    expect(await confirmation.isDisabled()).toBe(true)
    await dialog.getByRole('textbox').pressSequentially(name.slice(-1))
    expect(await confirmation.isEnabled()).toBe(true)
  })

  it('CMP-6: a dynamic component is created and opens in the registrar, where its shape is described', async () => {
    const { page } = session
    const uid = await register(page, `E2EDynamic${run}a`, 'Code it here')

    expect(new URL(page.url()).pathname).toBe(`/components/registrar/${uid}`)
    await shown(button(page, 'Add attribute'))
  })

  it('SRC-2: the registrar links a dynamic component to its code', async () => {
    const { page } = session
    const uid = await registerDynamic(page, `E2EDynamic${run}b`)

    await page.getByRole('link', { name: 'Edit the code' }).click()

    await page.waitForURL(url => url.pathname === `/components/editor/${uid}`, { timeout: SLOW_MS })
  })

  it('SRC-3: the editor shows the signature the body is wrapped in', async () => {
    const { page } = session
    const uid = await register(page, `E2EDynamic${run}c`, 'Code it here')
    await openCode(page, uid)

    await shown(page.getByText('export default function component'))
  })

  it('SRC-3, CMP-3: the signature names a parameter after the attribute, not after its identifier', async () => {
    const { page } = session
    const uid = await registerDynamic(page, `E2EDynamic${run}d`)

    await addAttribute(page, 'string')
    await page.getByLabel('Name:').last().pressSequentially('heading')
    await submitHeader(page)
    await reported(page, 'Component updated')

    await visit(page, `/components/editor/${uid}`)
    await shown(page.getByText('heading: string'))
  })

  it('SRC-4: a saved draft is kept', async () => {
    const { page } = session
    const uid = await register(page, `E2EDynamic${run}e`, 'Code it here')
    await openCode(page, uid)
    await writeAndSave(page, 'const answer = 42\nreturn answer\n')

    await page.reload()
    await expect.poll(async () => await page.locator('.cm-content').first().innerText(), { timeout: SLOW_MS }).toContain('answer')
  })

  it('SRC-4, HIS-1: the body steps back and forward through saved states', async () => {
    const { page } = session
    const uid = await register(page, `E2EDynamic${run}f`, 'Code it here')
    await openCode(page, uid)
    await writeAndSave(page, 'return 1\n')
    await writeAndSave(page, 'return 2\n')

    const editor = page.locator('.cm-content').first()
    await button(page, 'Undo').click()
    await expect.poll(async () => await editor.innerText(), { timeout: SLOW_MS }).toContain('return 1')

    await button(page, 'Redo').click()
    await expect.poll(async () => await editor.innerText(), { timeout: SLOW_MS }).toContain('return 2')

    await page.reload()
    await expect.poll(async () => await page.locator('.cm-content').first().innerText(), { timeout: SLOW_MS }).toContain('return 2')
  })

  it('HIS-2: a save from an editor opened before another save is refused, and the other save is kept', async () => {
    const { page } = session
    const uid = await register(page, `E2EDynamic${run}conflict`, 'Code it here')
    await openCode(page, uid)
    const stale = await session.context.newPage()
    try {
      await openCode(stale, uid)
      await writeAndSave(page, 'return 1')

      const editor = stale.locator('.cm-content').first()
      await editor.click()
      await stale.keyboard.press('ControlOrMeta+a')
      await stale.keyboard.type('return 2')
      await button(stale, 'Save').click()
      await reported(stale, 'Changed elsewhere. Reload to see the latest version.')
    } finally {
      await stale.close()
    }

    await openCode(page, uid)
    expect(await page.locator('.cm-content').first().innerText()).toContain('return 1')
  })

  it('HIS-1: a body nobody has saved has nothing to undo or redo', async () => {
    const { page } = session
    const uid = await register(page, `E2EDynamic${run}g`, 'Code it here')
    await openCode(page, uid)

    expect(await button(page, 'Undo').isDisabled()).toBe(true)
    expect(await button(page, 'Redo').isDisabled()).toBe(true)
  })

  it('SRC-5: an editor with unsaved changes asks before leaving, and declining keeps the body', async () => {
    const { page } = session
    const uid = await register(page, `E2EDynamic${run}h`, 'Code it here')
    await openCode(page, uid)
    await page.locator('.cm-content').first().click()
    await page.keyboard.type('return 2')

    const asked = new Promise<string>(resolve => {
      page.once('dialog', async dialog => {
        const message = dialog.message()
        await dialog.dismiss()
        resolve(message)
      })
    })
    await page.getByRole('link', { name: 'Edit the description' }).click()

    expect(await asked).toMatch(/unsaved changes/i)
    expect(new URL(page.url()).pathname).toBe(`/components/editor/${uid}`)
    expect(await page.locator('.cm-content').first().innerText()).toContain('return 2')

    await saveBody(page)
  })

  it('PUB-1, PUB-3, PUB-5, PUB-6: a dynamic component publishes, which compiles and signs it into one object', async () => {
    const { page } = session
    const uid = await register(page, `E2EDynamic${run}i`, 'Code it here')
    await openCode(page, uid)
    await writeAndSave(page, "return 'hi'\n")

    await visit(page, `/components/registrar/${uid}`)
    await publishRegistered(page)
    await reported(page, 'Component published')

    await expect.poll(async () => (await publishedObjects(uid)).length, { timeout: SLOW_MS }).toBe(1)
    expect((await publishedObjects(uid))[0]).toMatch(/[0-9a-f-]{36}\.json$/)
  })

  it('PUB-3, PUB-5, PUB-6: a refused publication is reported with its line and writes nothing', async () => {
    const { page } = session
    const uid = await register(page, `E2EDynamic${run}j`, 'Code it here')
    await openCode(page, uid)
    await writeAndSave(page, 'import { format } from "date-fns"\nreturn \'hi\'\n')

    await visit(page, `/components/registrar/${uid}`)
    await publishRegistered(page)

    await reported(page, /line \d+/)
    expect(await page.getByText('Component published').count()).toBe(0)
    expect(await publishedObjects(uid)).toStrictEqual([])
  })

  it('CMP-6: a name no source file could declare is accepted', async () => {
    const { page } = session
    const uid = await register(page, `E2EDynamic${run}k-with-hyphens`, 'Code it here')

    expect(uid).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('CMP-9: several dynamic components are removed in one action', async () => {
    const { page } = session
    const names = [`E2EDynamic${run}l`, `E2EDynamic${run}m`]
    for (const name of names) await register(page, name, 'Code it here')

    await openEditor(page)
    await selectNamed(page, names)
    const phrase = await confirmationPhrase(page)
    expect(phrase.split(',').length).toBe(2)
    await page.locator('input[name="confirmation"]').fill(phrase)
    await button(page, /^Yes, delete/).click()
    await reported(page, 'Deleted 2 components')

    await absentFrom(page, '/components/editor', names)
  })

  it('CMP-9: a bulk confirmation that does not name everything selected is refused', async () => {
    const { page } = session
    const names = [`E2EDynamic${run}n`, `E2EDynamic${run}o`]
    for (const name of names) await register(page, name, 'Code it here')

    await openEditor(page)
    await selectNamed(page, names)
    const phrase = await confirmationPhrase(page)
    await page.locator('input[name="confirmation"]').fill(phrase.split(',')[0])

    expect(await button(page, /^Yes, delete/).isDisabled()).toBe(true)
    await page.keyboard.press('Escape')
  })

  it('CMP-9: a dynamic component deleted from the code editor is gone from the list', async () => {
    const { page } = session
    const name = `E2EDynamic${run}p`
    const uid = await register(page, name, 'Code it here')
    await openCode(page, uid)

    await button(page, 'Delete component').click()
    const dialog = page.getByRole('dialog', { name: 'Delete the component' })
    await dialog.getByRole('textbox').pressSequentially(name)
    await dialog.getByRole('button', { name: /Yes, delete/ }).click()
    await reported(page, 'Component deleted')

    await absentFrom(page, '/components/editor', [name])
  })
})
