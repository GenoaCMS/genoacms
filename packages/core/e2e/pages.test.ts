import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { Locator, Page } from 'playwright'
import runtime from '@genoacms/adapter-gcp/storage/runtime'
import { startServer, type RunningServer, type User } from './server'
import { enabled, removeInstance } from './bucket'
import { launchBrowser, closeBrowser, signedInSession, type Session } from './browser'

const password = (): string => randomBytes(18).toString('base64url')
const run = randomBytes(4).toString('hex')

const ada: User = { subject: 'e2e-ada', email: 'ada@e2e.test', password: password() }

const SETUP_TIMEOUT_MS = 600_000
const TEARDOWN_TIMEOUT_MS = 120_000
const TEST_TIMEOUT_MS = 180_000
const SLOW_MS = 30_000
const PROJECT = process.env.GENOACMS_TEST_GCP_PROJECT ?? 'genoacms'
const BUCKET = process.env.GENOACMS_TEST_GCP_BUCKET ?? 'genoacms-tests'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const SLOT = 'body'
const ATTRIBUTE_TYPES = ['boolean', 'number', 'string', 'text', 'markdown', 'richText', 'link', 'storageResource'] as const
const PAGE_COMPONENT = `E2EPage${run}`
const componentFor = (type: string): string => `E2E${type[0].toUpperCase()}${type.slice(1)}${run}`
const valueOf = (type: string): string => `${type}Value`

interface TreeNode { component: string, uid?: string, publicationId?: string, data: Record<string, unknown> }
interface PageTree { type: string, payload: TreeNode }

let server: RunningServer
let session: Session

const shown = async (locator: Locator): Promise<void> => { await locator.first().waitFor({ state: 'visible', timeout: SLOW_MS }) }
const reported = async (page: Page, text: string | RegExp): Promise<void> => { await shown(page.getByText(text)) }
const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name })

async function visit (page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
}

async function storage (): Promise<Awaited<ReturnType<typeof runtime.create>>> {
  return await runtime.create({ projectId: PROJECT }, { name: 'e2e', resources: [BUCKET] })
}

async function objectsUnder (directory: string): Promise<string[]> {
  const { files, directories } = await (await storage()).listDirectory({ bucket: BUCKET, name: directory })
  return [...files.map(file => file.name), ...directories.map(entry => entry.name)]
}

async function readTree (name: string): Promise<PageTree> {
  const object = await (await storage()).getObject({ bucket: BUCKET, name: `.genoacms/pages/readables/${name}` })
  const chunks: Buffer[] = []
  for await (const chunk of object.data as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as PageTree
}

async function register (page: Page, name: string, kind: 'Already coded in my app' | 'Code it here'): Promise<string> {
  await visit(page, '/components/registrar')
  await button(page, 'Register component').click()
  const dialog = page.getByRole('dialog', { name: 'Register a new component' })
  await dialog.getByLabel('Component name:').fill(name)
  await dialog.getByRole('radio', { name: kind }).check()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL(/\/components\/registrar\/[^/]+$/, { timeout: SLOW_MS })
  const uid = new URL(page.url()).pathname.split('/').pop() ?? ''
  await visit(page, `/components/registrar/${uid}`)
  return uid
}

async function addAttribute (page: Page, type: string, name: string): Promise<void> {
  await button(page, 'Add attribute').click()
  const dialog = page.getByRole('dialog', { name: 'New attribute' })
  await dialog.getByRole('button', { name: type, exact: true }).click()
  const field = page.getByLabel('Name:').last()
  await shown(field)
  await field.fill(name)
}

async function submitHeader (page: Page): Promise<void> {
  await button(page, 'Submit').click()
  await reported(page, /updated|saved/i)
}

async function publishRegistered (page: Page): Promise<void> {
  await button(page, 'Publish').click()
  const dialog = page.getByRole('dialog', { name: 'Publish the component' })
  await dialog.getByRole('textbox').last().pressSequentially('published by the end-to-end suite')
  await dialog.getByRole('button', { name: /publish/i }).click()
  await reported(page, 'Component published')
}

async function registerPrebuilt (page: Page, name: string, type: string, attribute: string): Promise<string> {
  const uid = await register(page, name, 'Already coded in my app')
  await addAttribute(page, type, attribute)
  await submitHeader(page)
  return uid
}

async function publishedPrebuilt (page: Page, name: string, type: string, attribute: string): Promise<string> {
  const uid = await registerPrebuilt(page, name, type, attribute)
  await publishRegistered(page)
  return uid
}

async function publishBody (page: Page, uid: string, body: string): Promise<void> {
  await visit(page, `/components/editor/${uid}`)
  const editor = page.locator('.cm-content').first()
  await shown(editor)
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(body)
  await button(page, 'Save').click()
  await reported(page, 'Code saved')
  await visit(page, `/components/registrar/${uid}`)
  await publishRegistered(page)
}

async function openCreatePage (page: Page): Promise<Locator> {
  await visit(page, '/components/pages')
  await button(page, 'Create page').click()
  return page.getByRole('dialog', { name: 'Create a new page' })
}

async function createPage (page: Page, name: string, component: string): Promise<void> {
  const dialog = await openCreatePage(page)
  await dialog.getByLabel('Name:').fill(name)
  await dialog.getByLabel('Component:').selectOption({ label: component })
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await page.waitForURL(url => url.pathname.startsWith(`/components/pages/${encodeURIComponent(name)}/`), { timeout: SLOW_MS })
  await page.waitForLoadState('networkidle')
  await shown(page.getByRole('heading', { name }))
}

async function openPage (page: Page, name: string): Promise<void> {
  await visit(page, `/components/pages/${encodeURIComponent(name)}`)
  await shown(page.getByRole('heading', { name }))
}

const nestedCards = (page: Page): Locator => page.locator('.card')
  .filter({ has: page.getByRole('link', { name: 'Edit' }) })
  .filter({ hasNot: page.getByRole('button', { name: 'Add component' }) })

async function nestedNames (page: Page): Promise<string[]> {
  const texts = await nestedCards(page).allInnerTexts()
  return texts.map(text => text.trim().split(/\s+/)[0])
}

async function nest (page: Page, component: string): Promise<void> {
  const before = await nestedCards(page).filter({ hasText: component }).count()
  await button(page, 'Add component').click()
  const dialog = page.getByRole('dialog', { name: 'Add a new component' })
  await dialog.locator('form').filter({ hasText: component }).getByRole('button').click()
  await expect.poll(async () => await nestedCards(page).filter({ hasText: component }).count(), { timeout: SLOW_MS }).toBe(before + 1)
}

async function pageWithThree (page: Page, suffix: string): Promise<string[]> {
  await createPage(page, `e2e-${run}-${suffix}`, PAGE_COMPONENT)
  for (const type of ['boolean', 'number', 'string']) await nest(page, componentFor(type))
  return await nestedNames(page)
}

async function pressAndWait (page: Page, name: string, outcome: string): Promise<void> {
  await button(page, name).click()
  await reported(page, outcome)
  await page.waitForLoadState('networkidle')
}

async function namesAfterReload (page: Page): Promise<string[]> {
  await page.reload()
  await page.waitForLoadState('networkidle')
  await shown(page.getByText(SLOT, { exact: true }))
  return await nestedNames(page)
}

async function build (page: Page, name: string): Promise<void> {
  await openPage(page, name)
  await pressAndWait(page, 'Build', 'Saved')
}

async function openDeleteDialog (page: Page, uid: string): Promise<Locator> {
  await visit(page, `/components/registrar/${uid}`)
  await button(page, 'Delete component').click()
  return page.getByRole('dialog', { name: 'Delete the component' })
}

describe.skipIf(!enabled).sequential('pages through the running server', { timeout: TEST_TIMEOUT_MS }, () => {
  const composed = `e2e-${run}-composed`
  const uids: Record<string, string> = {}

  beforeAll(async () => {
    await removeInstance()
    server = await startServer({ primary: [ada] })
    await launchBrowser()
    session = await signedInSession(server, ada)
    const { page } = session
    uids.page = await publishedPrebuilt(page, PAGE_COMPONENT, 'components', SLOT)
    for (const type of ATTRIBUTE_TYPES) uids[type] = await publishedPrebuilt(page, componentFor(type), type, valueOf(type))
  }, SETUP_TIMEOUT_MS)

  afterAll(async () => {
    await closeBrowser()
    await server?.stop()
    await removeInstance()
  }, TEARDOWN_TIMEOUT_MS)

  describe('a page', () => {
    const name = `e2e-${run}-page`

    it('PGE-2, PGE-3: a page created from a published component is listed, and opens on its root node', async () => {
      const { page } = session
      await createPage(page, name, PAGE_COMPONENT)
      await shown(page.getByText(SLOT, { exact: true }))

      await visit(page, '/components/pages')
      await shown(page.getByRole('link', { name }))
    })

    it('PGE-6: a preview URL is saved and kept across a reload', async () => {
      const { page } = session
      await openPage(page, name)
      await button(page, 'Update preview URL').click()
      const dialog = page.getByRole('dialog', { name: 'Edit preview URL:' })
      await dialog.getByRole('textbox').fill('https://example.com/preview')
      await dialog.getByRole('button', { name: /save|update/i }).click()
      await reported(page, 'Edit successful')

      await page.reload()
      await shown(page.locator('iframe'))
      expect(await page.locator('iframe').getAttribute('src')).toBe('https://example.com/preview')
    })

    it('PGE-4: a value edited in the node editor is saved and kept across a reload', async () => {
      const { page } = session
      const text = `edited ${run}`
      await openPage(page, name)
      await nest(page, componentFor('string'))
      await nestedCards(page).filter({ hasText: componentFor('string') }).getByRole('link', { name: 'Edit' }).click()
      await shown(page.getByText(valueOf('string'), { exact: true }))
      await page.locator('.card').filter({ hasText: valueOf('string') }).getByRole('textbox').fill(text)
      await pressAndWait(page, 'Save', 'Saved')

      await page.reload()
      await page.waitForLoadState('networkidle')
      await shown(page.getByText(valueOf('string'), { exact: true }))
      expect(await page.locator('.card').filter({ hasText: valueOf('string') }).getByRole('textbox').inputValue()).toBe(text)
    })

    it('TRE-1: Build writes the page\'s tree to .genoacms/pages/readables/<name> as a genoacms.pageTree.v1 envelope', async () => {
      const { page } = session
      await build(page, name)

      expect((await readTree(name)).type).toBe('genoacms.pageTree.v1')
    })
  })

  describe('composing a page', () => {
    it('PUB-7: a component never published is offered neither as the root of a new page nor for a slot', async () => {
      const { page } = session
      const unpublished = `E2EUnpublished${run}`
      await registerPrebuilt(page, unpublished, 'string', 'headline')

      const dialog = await openCreatePage(page)
      const select = dialog.getByLabel('Component:')
      expect(await select.getByRole('option', { name: PAGE_COMPONENT }).count()).toBe(1)
      expect(await select.getByRole('option', { name: unpublished }).count()).toBe(0)

      await openPage(page, `e2e-${run}-page`)
      await button(page, 'Add component').click()
      const picker = page.getByRole('dialog', { name: 'Add a new component' })
      await shown(picker.getByText(componentFor('string'), { exact: true }))
      expect(await picker.getByText(unpublished, { exact: true }).count()).toBe(0)
    })

    it('PGE-5, PGE-3: components added to a slot are listed in the order added, and kept across a reload', async () => {
      const { page } = session
      await createPage(page, composed, PAGE_COMPONENT)
      for (const type of ATTRIBUTE_TYPES) await nest(page, componentFor(type))

      expect(await nestedNames(page)).toStrictEqual(ATTRIBUTE_TYPES.map(componentFor))
      expect(await namesAfterReload(page)).toStrictEqual(ATTRIBUTE_TYPES.map(componentFor))
    })

    it('PGE-3: a nested node opens in the node editor with its attributes', async () => {
      const { page } = session
      await openPage(page, composed)
      await nestedCards(page).first().getByRole('link', { name: 'Edit' }).click()

      await shown(page.getByText(valueOf('boolean'), { exact: true }))
    })

    it('PGE-7, HIS-1: undo removes the node added last, and redo restores it, on the screen and in storage', async () => {
      const { page } = session
      const before = await pageWithThree(page, 'undo')

      await pressAndWait(page, 'Undo', 'Undid')
      expect(await nestedNames(page)).toStrictEqual(before.slice(0, 2))
      expect(await namesAfterReload(page)).toStrictEqual(before.slice(0, 2))

      await pressAndWait(page, 'Redo', 'Redid')
      expect(await nestedNames(page)).toStrictEqual(before)
      expect(await namesAfterReload(page)).toStrictEqual(before)
    })

    it('PGE-4: a node removed from the slot stays removed after saving and a reload', async () => {
      const { page } = session
      const before = await pageWithThree(page, 'removal')
      await nestedCards(page).last().getByRole('button', { name: 'Delete' }).click()
      await button(page, 'Yes').click()
      await expect.poll(async () => await nestedNames(page), { timeout: SLOW_MS }).toStrictEqual(before.slice(0, 2))
      await pressAndWait(page, 'Save', 'Saved')

      expect(await namesAfterReload(page)).toStrictEqual(before.slice(0, 2))
    })

    it('PGE-4: dragging a nested node onto its sibling swaps them', async () => {
      const { page } = session
      const before = await pageWithThree(page, 'drag')
      const handle = nestedCards(page).nth(0).getByRole('button', { name: 'Dragger' })
      const start = await handle.boundingBox()
      const target = await nestedCards(page).nth(1).boundingBox()
      if (start === null || target === null) throw new Error('e2e/drag: a card has no box')
      await handle.hover()
      await page.mouse.down()
      await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 12, { steps: 4 })
      await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.75, { steps: 12 })
      await page.waitForTimeout(500)
      await page.mouse.up()
      await page.waitForLoadState('networkidle')

      await expect.poll(async () => (await nestedNames(page)).slice(0, 2), { timeout: SLOW_MS }).toStrictEqual([before[1], before[0]])
    })

    it('TRE-1, TRE-2: a page nesting a component of every attribute type builds, with a node per component', async () => {
      const { page } = session
      await build(page, composed)
      expect(await page.getByText(/error|failed/i).count()).toBe(0)

      const root = (await readTree(composed)).payload
      expect(root.component).toBe(PAGE_COMPONENT)
      expect((root.data[SLOT] as TreeNode[]).map(node => node.component)).toStrictEqual(ATTRIBUTE_TYPES.map(componentFor))
    })
  })

  describe('deleting a component a page depends on', () => {
    it('CMP-10, CMP-9: deleting a component a published page pins names the page and is refused, and the component stays', async () => {
      const { page } = session
      const pinned = `e2e-${run}-pinned`
      const used = componentFor('boolean')
      await createPage(page, pinned, PAGE_COMPONENT)
      await nest(page, used)
      await build(page, pinned)

      const dialog = await openDeleteDialog(page, uids.boolean)
      await shown(dialog.getByText(pinned))
      await dialog.getByRole('textbox').fill(used)
      await dialog.getByRole('button', { name: `Yes, delete ${used}` }).click()
      await shown(dialog.getByText(/used by .*published page/i))

      await visit(page, `/components/registrar/${uids.boolean}`)
      await shown(page.getByText(`Component: ${used}`))
    })

    it('CMP-10: the delete dialog of a component no published page pins says so', async () => {
      const { page } = session
      const uid = await registerPrebuilt(page, `E2EUnused${run}`, 'string', 'headline')

      const dialog = await openDeleteDialog(page, uid)
      await shown(dialog.getByText('No published page uses this component.'))
    })
  })

  describe('revisions a page pins', () => {
    const component = `E2EPinned${run}`
    const pinning = `e2e-${run}-revision`
    let uid = ''
    let first: string | undefined

    it('TRE-2, PGE-9: a built page pins its component\'s publication, and a newer publication leaves the built tree unchanged', async () => {
      const { page } = session
      uid = await register(page, component, 'Code it here')
      await publishBody(page, uid, "return 'first'\n")
      await createPage(page, pinning, component)
      await build(page, pinning)
      first = (await readTree(pinning)).payload.publicationId
      expect(first).toMatch(UUID)

      await publishBody(page, uid, "return 'second'\n")
      expect((await readTree(pinning)).payload.publicationId).toBe(first)
    })

    it('TRE-2: building the page again pins the newer publication', async () => {
      const { page } = session
      await build(page, pinning)

      const republished = (await readTree(pinning)).payload.publicationId
      expect(republished).toMatch(UUID)
      expect(republished).not.toBe(first)
    })

    it('PUB-4, PUB-5: each publication of a dynamic component keeps its own executable', async () => {
      expect(await objectsUnder(`.genoacms/components/public/${uid}/`)).toHaveLength(2)
    })

    it('PGE-8: deleting pages in one action removes their entries and trees', async () => {
      const { page } = session
      const names = [pinning, `e2e-${run}-pinned`]
      await visit(page, '/components/pages')
      for (const name of names) await page.locator(`button[aria-label="select-${name}"]`).click()
      await button(page, 'Delete selected').click()
      await page.locator('input[name="confirmation"]').fill((await page.locator('code').innerText()).trim())
      await button(page, /^Yes, delete/).click()

      await expect.poll(async () => {
        await visit(page, '/components/pages')
        let listed = 0
        for (const name of names) listed += await page.getByRole('link', { name, exact: true }).count()
        return listed
      }, { timeout: SLOW_MS, interval: 500 }).toBe(0)
      for (const directory of ['entries', 'readables']) {
        const left = await objectsUnder(`.genoacms/pages/${directory}/`)
        expect(left.filter(object => names.some(name => object.endsWith(`/${name}`)))).toStrictEqual([])
      }
    })

    it('CMP-9: deleting a dynamic component removes its source, its header and every publication', async () => {
      const { page } = session
      await visit(page, `/components/editor/${uid}`)
      await button(page, 'Delete component').click()
      const dialog = page.getByRole('dialog', { name: 'Delete the component' })
      await dialog.getByRole('textbox').pressSequentially(component)
      await dialog.getByRole('button', { name: /Yes, delete/ }).click()
      await reported(page, 'Component deleted')

      const left: string[] = []
      for (const directory of ['dynamic', 'headers', 'public', 'publications']) {
        left.push(...(await objectsUnder(`.genoacms/components/${directory}/`)).filter(object => object.includes(uid)))
      }
      expect(left).toStrictEqual([])
    })
  })
})
