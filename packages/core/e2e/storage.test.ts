import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import type { Locator, Page } from 'playwright'
import runtime from '@genoacms/adapter-gcp/storage/runtime'
import { startServer, type RunningServer, type User } from './server'
import { enabled, removeInstance, writeObject } from './bucket'
import { launchBrowser, closeBrowser, signedInSession, type Session } from './browser'

const password = (): string => randomBytes(18).toString('base64url')
const run = randomBytes(4).toString('hex')

const ada: User = { subject: 'e2e-ada', email: 'ada@e2e.test', password: password() }
const carol: User = { subject: 'e2e-carol', email: 'carol@e2e.test', password: password() }
/** Holds `storage:bucket:read` on the test bucket and nothing else: `genoa.config/e2e.ts` assigns it the role `StorageReader`. */
const dan: User = { subject: 'e2e-dan', email: 'dan@e2e.test', password: password() }

const SETUP_TIMEOUT_MS = 120_000
const TEARDOWN_TIMEOUT_MS = 600_000
const TEST_TIMEOUT_MS = 60_000
const PAGE_OF_1000 = 1000
const WRITE_BATCH = 50
const BUCKET = process.env.GENOACMS_TEST_GCP_BUCKET ?? 'genoacms-tests'
const PROJECT = process.env.GENOACMS_TEST_GCP_PROJECT ?? 'genoacms'
const ROOT = `e2e-${run}/`
const DELIMITER = '|->'

let server: RunningServer
let adaSession: Session
let carolSession: Session
let danSession: Session

const storage = async () => await runtime.create({ projectId: PROJECT }, { name: 'e2e', resources: [BUCKET] })

async function write (names: string[]): Promise<void> {
  for (let start = 0; start < names.length; start += WRITE_BATCH) {
    await Promise.all(names.slice(start, start + WRITE_BATCH).map(async name => { await writeObject(name, name) }))
  }
}

async function exists (name: string): Promise<boolean> {
  try {
    await (await storage()).getObject({ bucket: BUCKET, name })
    return true
  } catch {
    return false
  }
}

async function contentOf (name: string): Promise<string> {
  const { data } = await (await storage()).getObject({ bucket: BUCKET, name })
  const chunks: Buffer[] = []
  for await (const chunk of data) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf-8')
}

async function removeFixtures (): Promise<void> {
  await (await storage()).deleteDirectory({ bucket: BUCKET, name: ROOT })
}

const shown = async (locator: Locator): Promise<void> => { await locator.first().waitFor({ state: 'visible' }) }
const button = (page: Page, name: string): Locator => page.getByRole('button', { name, exact: true })
const checkbox = (page: Page, name: string): Locator => page.getByRole('button', { name: `select-${name}`, exact: true })
const toast = (page: Page, text: string): Locator => page.getByText(text, { exact: true })
const pause = async (ms: number): Promise<void> => { await new Promise(resolve => setTimeout(resolve, ms)) }

/** Navigates, then waits until the page has hydrated, so a click lands on the live page. */
async function visit (page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
}

/** The route of a directory: each level, with its trailing slash, after the delimiter. */
const contentsUrl = (directory: string, query = ''): string => {
  const levels = directory.split('/').filter(level => level !== '').map(level => `${DELIMITER}${level}/`)
  return levels.length === 0 ? `/storage/${BUCKET}/contents${query}` : `/storage/${BUCKET}/${levels.join('')}/contents${query}`
}

const decodedLocation = (page: Page): string => {
  const url = new URL(page.url())
  return decodeURIComponent(url.pathname) + url.search
}

async function openRenameFor (page: Page, item: Locator): Promise<void> {
  await item.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  await shown(page.getByLabel('New name:'))
}

async function confirmWith (page: Page, question: string): Promise<void> {
  await shown(page.getByText(question, { exact: true }))
  await button(page, 'Yes').click()
}

const formAnswer = (data: unknown): string => JSON.stringify({ type: 'failure', status: 500, data })

/** Answers the form action `?/<action>` of the storage browser with a failure, instead of the server. */
async function failAction (page: Page, action: string, result: { done: number, failed: string[] }): Promise<void> {
  const devalued = JSON.stringify([{ done: 1, failed: 2 }, result.done, result.failed.map((_, index) => 3 + index), ...result.failed])
  await page.route(url => url.pathname.endsWith('/contents') && url.search.endsWith(`?/${action}`), async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: formAnswer(devalued) })
  })
}

describe.skipIf(!enabled).sequential('the storage browser through the running server', { timeout: TEST_TIMEOUT_MS }, () => {
  beforeAll(async () => {
    await removeInstance()
    await removeFixtures()
    await write([`${ROOT}a.png`, `${ROOT}b.png`, `${ROOT}sub/c.png`])
    server = await startServer({ primary: [ada, carol, dan] })
    await launchBrowser()
    adaSession = await signedInSession(server, ada)
    carolSession = await signedInSession(server, carol)
    danSession = await signedInSession(server, dan)
  }, SETUP_TIMEOUT_MS)

  afterAll(async () => {
    await closeBrowser()
    await server?.stop()
    await removeFixtures()
    await removeInstance()
  }, TEARDOWN_TIMEOUT_MS)

  afterEach(async () => {
    await adaSession?.page.unrouteAll({ behavior: 'ignoreErrors' })
    await adaSession?.page.evaluate(() => { sessionStorage.clear() }).catch(() => {})
  })

  it('STS-1, BRW-1: the bucket list shows the buckets the principal holds a grant on, and opens a bucket\'s root', async () => {
    const { page } = adaSession
    await visit(page, '/storage')
    await shown(page.getByRole('heading', { name: 'Buckets', exact: true }))
    const link = page.locator(`a[href$="${BUCKET}/contents"]`)
    await shown(link)
    await link.first().click()
    await page.waitForURL(`**/storage/${BUCKET}/contents`)
    const redirect = await adaSession.context.request.get(`/storage/${BUCKET}`, { maxRedirects: 0 })
    expect(redirect.status()).toBe(307)
    expect(new URL(redirect.headers().location, server.origin).pathname).toBe(`/storage/${BUCKET}/contents`)

    await visit(carolSession.page, '/storage')
    expect(await carolSession.page.locator(`a[href$="${BUCKET}/contents"]`).count()).toBe(0)
  })

  it('BRW-1, BRW-2: links keep the query string, and the path names each level', async () => {
    const { page } = adaSession
    await visit(page, `/storage/${BUCKET}/contents?selectionId=x`)
    await page.getByRole('link', { name: ROOT.slice(0, -1), exact: true }).click()
    await page.waitForURL(url => decodeURIComponent(url.pathname) === `/storage/${BUCKET}/${DELIMITER}${ROOT}/contents`)
    await page.getByRole('link', { name: 'sub', exact: true }).click()
    await page.waitForURL(url => decodeURIComponent(url.pathname).endsWith(`${DELIMITER}sub//contents`))

    expect(decodedLocation(page)).toBe(`/storage/${BUCKET}/${DELIMITER}${ROOT}${DELIMITER}sub//contents?selectionId=x`)
    await shown(page.getByRole('heading', { name: `${ROOT}sub/`, exact: true }))
    await page.getByRole('link', { name: /back/i }).click()
    await page.waitForURL(url => decodeURIComponent(url.pathname) === `/storage/${BUCKET}/${DELIMITER}${ROOT}/contents`)
    await page.getByRole('link', { name: /back/i }).click()
    await page.waitForURL(url => decodeURIComponent(url.pathname) === `/storage/${BUCKET}/contents`)
    await page.getByRole('link', { name: /back/i }).click()
    await page.waitForURL('**/storage')
  })

  it('BRW-3: directories, then files, each opening', async () => {
    const { page } = adaSession
    await visit(page, contentsUrl(ROOT))
    await shown(page.getByRole('link', { name: 'sub', exact: true }))
    const file = page.getByRole('link', { name: 'a.png', exact: true })
    await shown(file)

    const directory = page.getByRole('link', { name: 'sub', exact: true })
    const isDirectoryFirst = await directory.evaluate((element, other) => Boolean(element.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await file.elementHandle())
    expect(isDirectoryFirst).toBe(true)
    expect(await file.getAttribute('target')).toBe('_blank')
    const response = await adaSession.context.request.get((await file.getAttribute('href')) ?? '')
    expect(await response.text()).toBe(`${ROOT}a.png`)
    await page.getByRole('link', { name: 'sub', exact: true }).click()
    await shown(page.getByRole('link', { name: 'c.png', exact: true }))
  })

  it('BRW-4: the toolbar shows what the principal may use', async () => {
    const { page } = adaSession
    await visit(page, contentsUrl(ROOT))
    await shown(checkbox(page, `${ROOT}a.png`))
    expect(await button(page, 'Create directory').count()).toBe(1)
    expect(await button(page, 'Upload object').count()).toBe(1)
    await checkbox(page, `${ROOT}a.png`).click()
    expect(await button(page, 'Move here').count()).toBe(1)
    expect(await button(page, 'Delete').count()).toBe(1)
    await openRenameFor(page, page.getByRole('link', { name: 'a.png', exact: true }))
    await page.keyboard.press('Escape')

    const reader = danSession.page
    await visit(reader, contentsUrl(ROOT))
    await shown(checkbox(reader, `${ROOT}a.png`))
    await checkbox(reader, `${ROOT}a.png`).click()
    expect(await button(reader, 'Select all').count() + await button(reader, 'Unselect all').count()).toBe(1)
    for (const name of ['Create directory', 'Upload object', 'Move here', 'Delete']) expect(await button(reader, name).count(), name).toBe(0)
    await reader.getByRole('link', { name: 'a.png', exact: true }).click({ button: 'right' })
    expect(await reader.getByRole('menuitem', { name: 'Rename', exact: true }).count()).toBe(0)
  })

  it('BRW-5: select all, unselect all, and a selection that follows navigation', async () => {
    const { page } = adaSession
    await visit(page, contentsUrl(ROOT))
    await shown(checkbox(page, `${ROOT}a.png`))
    await button(page, 'Select all').click()
    const pressed = await page.locator('button[aria-label^="select-"], button[name^="select-"]').evaluateAll(boxes => boxes.map(box => box.getAttribute('aria-pressed')))
    expect(new Set(pressed)).toEqual(new Set(['true']))
    await button(page, 'Unselect all').click()
    expect(await checkbox(page, `${ROOT}a.png`).getAttribute('aria-pressed')).toBe('false')

    await checkbox(page, `${ROOT}a.png`).click()
    await page.getByRole('link', { name: 'sub', exact: true }).click()
    await shown(checkbox(page, `${ROOT}sub/c.png`))
    await checkbox(page, `${ROOT}sub/c.png`).click()
    await page.getByRole('link', { name: /back/i }).click()
    await shown(checkbox(page, `${ROOT}a.png`))
    expect(await checkbox(page, `${ROOT}a.png`).getAttribute('aria-pressed')).toBe('true')
    await button(page, 'Unselect all').click()
  })

  it('BRW-6, BRW-14: uploading two files lists both, and replaces one of the same name', async () => {
    const { page } = adaSession
    const directory = `${ROOT}upload/`
    await write([`${directory}existing.txt`])
    await visit(page, contentsUrl(directory))
    await button(page, 'Upload object').click()
    await shown(page.getByText('Upload files', { exact: true }))
    await page.locator('input[type=file]').setInputFiles([
      { name: 'one.txt', mimeType: 'text/plain', buffer: Buffer.from('first') },
      { name: 'existing.txt', mimeType: 'text/plain', buffer: Buffer.from('replaced') }
    ])
    await button(page, 'Upload').click()
    await shown(toast(page, 'Upload successful'))

    await shown(page.getByRole('link', { name: 'one.txt', exact: true }))
    await shown(page.getByRole('link', { name: 'existing.txt', exact: true }))
    expect(await contentOf(`${directory}one.txt`)).toBe('first')
    expect(await contentOf(`${directory}existing.txt`)).toBe('replaced')
  })

  it('BRW-7, BRW-13: a directory is created, and a name with / is refused', async () => {
    const { page } = adaSession
    const directory = `${ROOT}creating/`
    await write([`${directory}keep.txt`])
    await visit(page, contentsUrl(directory))
    await button(page, 'Create directory').click()
    await page.getByLabel('Directory name:').fill('fresh')
    await page.keyboard.press('Enter')
    await shown(toast(page, 'Directory created'))
    await shown(page.getByRole('link', { name: 'fresh', exact: true }))

    await button(page, 'Create directory').click()
    await page.getByLabel('Directory name:').fill('a/b')
    await page.keyboard.press('Enter')
    await shown(toast(page, 'Failed to create directory'))
    expect(await page.getByRole('link', { name: 'a', exact: true }).count()).toBe(0)
  })

  it('BRW-8: renaming a directory leaves its sibling of a longer name in place', async () => {
    const { page } = adaSession
    const directory = `${ROOT}renaming/`
    await write([`${directory}2024/x.txt`, `${directory}2024-old/y.txt`])
    await visit(page, contentsUrl(directory))
    await openRenameFor(page, page.getByRole('link', { name: '2024', exact: true }))
    await page.getByLabel('New name:').fill('2025')
    await page.keyboard.press('Enter')
    await shown(toast(page, 'Renamed'))

    expect(await exists(`${directory}2025/x.txt`)).toBe(true)
    expect(await exists(`${directory}2024/x.txt`)).toBe(false)
    expect(await exists(`${directory}2024-old/y.txt`)).toBe(true)
    expect(await exists(`${directory}2025-old/y.txt`)).toBe(false)
  })

  it('BRW-9: moving here moves the selection, and leaves what is already here', async () => {
    const { page } = adaSession
    const source = `${ROOT}moving-from/`
    const target = `${ROOT}moving-to/`
    await write([`${source}a.txt`, `${source}dir/b.txt`, `${target}already.txt`])
    await visit(page, contentsUrl(source))
    await checkbox(page, `${source}a.txt`).click()
    await checkbox(page, `${source}dir/`).click()
    await visit(page, contentsUrl(target))
    await shown(checkbox(page, `${target}already.txt`))
    await checkbox(page, `${target}already.txt`).click()
    await button(page, 'Move here').click()
    await shown(toast(page, 'Moved'))

    expect(await exists(`${target}a.txt`)).toBe(true)
    expect(await exists(`${target}dir/b.txt`)).toBe(true)
    expect(await exists(`${target}already.txt`)).toBe(true)
    expect(await exists(`${source}a.txt`)).toBe(false)
    expect(await exists(`${source}dir/b.txt`)).toBe(false)
    expect(await button(page, 'Move here').count()).toBe(0)
  })

  it('BRW-10: deleting asks with the counts, and declining deletes nothing', async () => {
    const { page } = adaSession
    const directory = `${ROOT}deleting/`
    await write([`${directory}1.txt`, `${directory}2.txt`, `${directory}dir/3.txt`])
    await visit(page, contentsUrl(directory))
    await button(page, 'Select all').click()
    await button(page, 'Delete').click()
    await shown(page.getByText('Do you want to delete one directory and 2 files?', { exact: true }))
    await button(page, 'No').click()
    expect(await exists(`${directory}1.txt`)).toBe(true)

    await button(page, 'Delete').click()
    await confirmWith(page, 'Do you want to delete one directory and 2 files?')
    await shown(toast(page, 'Deleted'))
    for (const name of ['1.txt', '2.txt', 'dir/3.txt']) expect(await exists(`${directory}${name}`), name).toBe(false)
  })

  it('BRW-12: as a picker, directories have no checkbox and Confirm selection returns the selection', async () => {
    const selectionId = randomUUID()
    const opener = await adaSession.context.newPage()
    await opener.goto('/dashboard')
    await opener.evaluate(id => {
      const received: unknown[] = []
      const channel = new BroadcastChannel(id)
      channel.onmessage = (event: MessageEvent<{ eventName: string, data: unknown }>) => {
        if (event.data.eventName === 'selectionInit') channel.postMessage({ eventName: 'selectionInitData', data: { parameters: { maxItems: 0 }, defaultValue: [] } })
        if (event.data.eventName === 'selectionDone') {
          received.push(event.data.data)
          channel.postMessage({ eventName: 'selectionKill' })
        }
      }
      ;(window as unknown as { received: unknown[] }).received = received
    }, selectionId)

    const opened = adaSession.context.waitForEvent('page')
    await opener.evaluate(url => { window.open(url, '_blank') }, contentsUrl(ROOT, `?selectionId=${selectionId}`))
    const picker = await opened
    await picker.waitForLoadState('networkidle')
    await shown(checkbox(picker, `${ROOT}a.png`))
    expect(await checkbox(picker, `${ROOT}sub/`).count()).toBe(0)
    await checkbox(picker, `${ROOT}a.png`).click()
    const closed = picker.waitForEvent('close')
    await button(picker, 'Confirm selection').click()
    await closed

    const received = await opener.evaluate(() => (window as unknown as { received: unknown[] }).received)
    expect(received).toEqual([[{ bucket: BUCKET, name: `${ROOT}a.png` }]])
    await opener.close()
  })

  it('BRW-12: a picker takes maxItems and the current value from the opener, and a full selection can still be undone', async () => {
    const selectionId = randomUUID()
    const opener = await adaSession.context.newPage()
    await opener.goto('/dashboard')
    await opener.evaluate(({ id, current }) => {
      const channel = new BroadcastChannel(id)
      channel.onmessage = (event: MessageEvent<{ eventName: string }>) => {
        if (event.data.eventName === 'selectionInit') channel.postMessage({ eventName: 'selectionInitData', data: { parameters: { maxItems: 1 }, defaultValue: [current] } })
      }
    }, { id: selectionId, current: { bucket: BUCKET, name: `${ROOT}a.png` } })

    const picker = await adaSession.context.newPage()
    await visit(picker, contentsUrl(ROOT, `?selectionId=${selectionId}`))
    await picker.waitForFunction(name => document.querySelector(`[aria-label="select-${name}"]`)?.getAttribute('aria-pressed') === 'true', `${ROOT}a.png`)
    await checkbox(picker, `${ROOT}b.png`).click()
    expect(await checkbox(picker, `${ROOT}b.png`).getAttribute('aria-pressed')).toBe('false')
    await checkbox(picker, `${ROOT}a.png`).click()
    expect(await checkbox(picker, `${ROOT}a.png`).getAttribute('aria-pressed')).toBe('false')
    await checkbox(picker, `${ROOT}b.png`).click()
    expect(await checkbox(picker, `${ROOT}b.png`).getAttribute('aria-pressed')).toBe('true')
    await picker.close()
    await opener.close()
  })

  it('BRW-14: a partial failure names the failed items and keeps only them selected', async () => {
    const { page } = adaSession
    const directory = `${ROOT}partial/`
    await write([`${directory}a.png`, `${directory}b.png`])
    await visit(page, contentsUrl(directory))
    await failAction(page, 'delete', { done: 1, failed: [`${directory}b.png`] })
    await checkbox(page, `${directory}a.png`).click()
    await checkbox(page, `${directory}b.png`).click()
    await button(page, 'Delete').click()
    await confirmWith(page, 'Do you want to delete 2 files?')

    await shown(toast(page, `1 of 2 deleted. Failed: ${directory}b.png`))
    expect(await checkbox(page, `${directory}b.png`).getAttribute('aria-pressed')).toBe('true')
    expect(await checkbox(page, `${directory}a.png`).getAttribute('aria-pressed')).toBe('false')
  })

  it('BRW-15: Show more loads the next page into the view', async () => {
    const { page } = adaSession
    const directory = `${ROOT}many/`
    await write(Array.from({ length: PAGE_OF_1000 + 1 }, (_, index) => `${directory}${String(index).padStart(4, '0')}.txt`))
    await visit(page, contentsUrl(directory))
    await shown(button(page, 'Show more'))
    expect(await page.locator('button[aria-label^="select-"]').count()).toBe(PAGE_OF_1000)

    await button(page, 'Show more').click()
    await page.waitForFunction(count => document.querySelectorAll('button[aria-label^="select-"]').length === count, PAGE_OF_1000 + 1)
    expect(await button(page, 'Show more').count()).toBe(0)
  }, 180_000)

  it('STS-2, BRW-16: a principal without a permission is refused with 403, and nothing changes', async () => {
    const directory = `${ROOT}sts2/`
    await write([`${directory}x.txt`])

    const refusedListing = await carolSession.page.goto(contentsUrl(directory))
    expect(refusedListing?.status()).toBe(403)

    const reader = danSession.page
    await visit(reader, contentsUrl(directory))
    const answer = await reader.evaluate(async ({ action, name, bucket }) => {
      const body = new FormData()
      body.set('contents', JSON.stringify([{ bucket, name }]))
      const response = await fetch(`${location.pathname}?/${action}`, { method: 'POST', body, headers: { 'x-sveltekit-action': 'true', accept: 'application/json' } })
      return await response.json() as { type: string, status: number }
    }, { action: 'delete', name: `${directory}x.txt`, bucket: BUCKET })

    expect(answer).toMatchObject({ type: 'failure', status: 403 })
    expect(await exists(`${directory}x.txt`)).toBe(true)
  })

  it('STS-5, BRW-16: .genoacms/ opens for reading, and an upload into it is refused', async () => {
    const { page } = adaSession
    await visit(page, contentsUrl('.genoacms/'))
    await shown(page.getByRole('heading', { name: '.genoacms/', exact: true }))

    await button(page, 'Upload object').click()
    await page.locator('input[type=file]').setInputFiles([{ name: `refused-${run}.txt`, mimeType: 'text/plain', buffer: Buffer.from('no') }])
    await button(page, 'Upload').click()
    await shown(toast(page, 'Upload failed'))
    await pause(500)
    expect(await exists(`.genoacms/refused-${run}.txt`)).toBe(false)
  })
})
