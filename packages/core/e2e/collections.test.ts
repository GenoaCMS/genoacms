import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import type { Dialog, Locator, Page } from 'playwright'
import { startServer, type RunningServer, type User } from './server'
import { enabled, removeInstance, writeCollectionDefinition, writeObject, deleteObjects } from './bucket'
import { launchBrowser, closeBrowser, signedInSession, type Session } from './browser'
import { createDocument, readDocument, deleteDocuments } from './database'
import { signCollectionDefinition } from './signing'

const password = (): string => randomBytes(18).toString('base64url')
const run = randomBytes(4).toString('hex')

const ada: User = { subject: 'e2e-ada', email: 'ada@e2e.test', password: password() }
const carol: User = { subject: 'e2e-carol', email: 'carol@e2e.test', password: password() }

const SETUP_TIMEOUT_MS = 120_000
const TEST_TIMEOUT_MS = 60_000
const BUCKET = process.env.GENOACMS_TEST_GCP_BUCKET ?? 'genoacms-tests'
const FILES = [`e2e-${run}-a.png`, `e2e-${run}-b.png`]

/** A dynamic definition; written also under the name of a configured collection, which it cannot replace (COL-2). */
const dynamicDefinition = (name: string) => ({
  name,
  primaryKey: { key: 'id', schema: { type: 'string' } },
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      shadowField: { type: 'string' },
      hiddenInListing: { type: 'string' },
      limited: { type: 'array', maxItems: 1, items: { type: 'string' } },
      gallery: { type: 'array', maxItems: 1, items: { type: 'object', title: 'storageResource', properties: { bucket: { type: 'string' }, name: { type: 'string' } } } }
    }
  },
  uiSchema: { hiddenInListing: { showPreview: false } }
})

let server: RunningServer
let adaSession: Session
let carolSession: Session
const created: Record<string, string[]> = { authors: [], articles: [], test: [], dynamic: [] }

const fixture = async (collection: 'authors' | 'articles' | 'test' | 'dynamic', data: Record<string, unknown>): Promise<string> => {
  const id = await createDocument(collection, data)
  created[collection].push(id)
  return id
}

const author = async (name: string): Promise<string> => await fixture('authors', { name: `${run} ${name}`, role: 'writer' })

const article = async (authorId: string, contributorId: string): Promise<string> => await fixture('articles', {
  title: `${run} article`,
  slug: `${run}-article`,
  isPublished: false,
  author: authorId,
  contributors: [contributorId],
  metadata: {
    readingTimeMinutes: 3,
    tags: [],
    seo: { metaTitle: '', metaDescription: '', socialShareImage: { bucket: BUCKET, name: 'e2e/cover.png' } }
  },
  sections: [
    { type: 'hero', headline: `${run} headline`, subheadline: '', coverImage: null, cta: { label: '', url: '', style: 'primary' } },
    { type: 'richText', body: '# Rendered heading' }
  ]
})

const checkbox = (page: Page, id: string): Locator => page.getByRole('button', { name: `Select ${id}`, exact: true })
const button = (page: Page, name: string): Locator => page.getByRole('button', { name, exact: true })
const shown = async (locator: Locator): Promise<void> => { await locator.first().waitFor({ state: 'visible' }) }
const left = async (locator: Locator): Promise<number> => (await locator.boundingBox())?.x ?? Number.NaN

async function confirmWith (page: Page, question: string): Promise<void> {
  await shown(page.getByText(question, { exact: true }))
  await button(page, 'Yes').click()
}

/** Navigates, then waits until the page has hydrated, so a click lands on the live page. */
async function visit (page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
}

const pause = async (ms: number): Promise<void> => { await new Promise(resolve => setTimeout(resolve, ms)) }

interface CommandAnswer { result?: { status: string, text: string }, error?: true, delayMs?: number }

/** The body SvelteKit answers a remote command with: devalue of `{ _: result }`. */
const commandResult = (result: { status: string, text: string }): string =>
  JSON.stringify({ type: 'result', data: `[{"_":1},{"status":2,"text":3},${JSON.stringify(result.status)},${JSON.stringify(result.text)}]` })

/** Answers the remote command `name` instead of the server, or delays the server's answer. */
async function answerCommand (page: Page, name: string, answer: CommandAnswer): Promise<void> {
  await page.route(url => url.pathname.startsWith('/_app/remote/') && url.pathname.endsWith(`/${name}`), async route => {
    if (answer.delayMs !== undefined) await pause(answer.delayMs)
    if (answer.error === true) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ type: 'error', status: 500, error: {} }) })
      return
    }
    if (answer.result !== undefined) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: commandResult(answer.result) })
      return
    }
    await route.continue()
  })
}

/** Fails the form action `?/delete` posted from `pathname`, after a delay. */
async function failDeletion (page: Page, pathname: string): Promise<void> {
  await page.route(url => url.pathname === pathname && url.search === '?/delete', async route => {
    await pause(1500)
    await route.fulfill({ status: 500, contentType: 'text/plain', body: 'failed by the test' })
  })
}

async function catalog (page: Page): Promise<string[]> {
  await visit(page, '/collections')
  await shown(page.locator('a[href="/collections/test"]'))
  const hrefs = await page.locator('a[href^="/collections/"]').evaluateAll(links => links.map(link => link.getAttribute('href') ?? ''))
  return hrefs.map(href => href.replace('/collections/', ''))
}

async function openDocument (page: Page, collection: string, id: string): Promise<void> {
  await visit(page, `/collections/${collection}/${id}`)
  await shown(page.getByRole('heading', { level: 1 }))
}

// OF19
async function dragFirstBelowSecond (page: Page, handle: Locator): Promise<void> {
  const items = await handle.evaluate(element => {
    const holdsHandles = (candidate: Element): boolean =>
      candidate.children.length > 1 && [...candidate.children].every(child => child.querySelector('[aria-label^="Drag item"]') !== null)
    let zone = element.parentElement
    while (zone !== null && !holdsHandles(zone)) zone = zone.parentElement
    if (zone === null) throw new Error('the handle is in no list')
    return [...zone.children].map(item => { const box = item.getBoundingClientRect(); return { top: box.top, bottom: box.bottom } })
  })
  const from = await handle.boundingBox()
  if (from === null || items.length < 2) throw new Error('nothing to drag')
  const centre = (item: { top: number, bottom: number }): number => (item.top + item.bottom) / 2
  const distance = (centre(items[1]) + items[1].bottom) / 2 - centre(items[0])
  const x = from.x + from.width / 2
  const y = from.y + from.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + distance, { steps: 30 })
  await page.waitForTimeout(600)
  await page.mouse.up()
}

describe.skipIf(!enabled).sequential('collections through the running server', { timeout: TEST_TIMEOUT_MS }, () => {
  beforeAll(async () => {
    await removeInstance()
    await writeCollectionDefinition('firestore', 'test', dynamicDefinition('test'))
    await writeCollectionDefinition('nowhere', `nowhere-${run}`, dynamicDefinition(`nowhere-${run}`))
    await Promise.all(FILES.map(async name => { await writeObject(name, name) }))
    await (await startServer({ primary: [ada, carol] })).stop()
    await writeCollectionDefinition('firestore', 'dynamic', await signCollectionDefinition('firestore', dynamicDefinition('dynamic')))
    await writeCollectionDefinition('firestore', 'unsigned', dynamicDefinition('unsigned'))
    server = await startServer({ primary: [ada, carol] })
    await launchBrowser()
    adaSession = await signedInSession(server, ada)
    carolSession = await signedInSession(server, carol)
  }, SETUP_TIMEOUT_MS)

  afterAll(async () => {
    const timed = async (step: string, action: () => Promise<unknown>): Promise<void> => {
      const started = Date.now()
      await action()
      console.log(`[e2e] ${step}: ${Date.now() - started} ms`)
    }
    await timed('closeBrowser', closeBrowser)
    await timed('stop', async () => await server?.stop())
    await timed('deleteDocuments', async () => await Promise.all(Object.entries(created).map(async ([collection, ids]) => { await deleteDocuments(collection, ids) })))
    await timed('removeInstance', removeInstance)
    await timed('deleteObjects', async () => { await deleteObjects(FILES) })
  }, SETUP_TIMEOUT_MS)

  afterEach(async () => {
    await adaSession?.page.unrouteAll({ behavior: 'ignoreErrors' })
  })

  describe('the catalog', () => {
    it('COL-1: lists the configured collections, then each dynamic one, and no directory of another database', async () => {
      expect(await catalog(adaSession.page)).toEqual(['test', 'authors', 'articles', 'dynamic', 'unsigned'])
    })

    it('COL-2: a dynamic definition cannot replace a configured collection', async () => {
      const { page } = adaSession
      await visit(page, '/collections/test')
      await shown(page.getByText('isA', { exact: true }))

      expect(await page.getByText('shadowField', { exact: true }).count()).toBe(0)
    })

    it('COL-2, COL-7: a signed dynamic collection resolves to its definition', async () => {
      const { page } = adaSession
      await visit(page, '/collections/dynamic')
      await shown(page.getByText('shadowField', { exact: true }))
    })

    it('COL-2, COL-7: an unsigned dynamic definition is refused with collection/unverifiable', async () => {
      const response = await adaSession.page.goto('/collections/unsigned')

      expect(response?.status()).toBe(500)
      expect(server.output()).toContain('collection/unverifiable')
    })

    it('COL-6: a dynamic collection is served by the database of its directory', async () => {
      await fixture('dynamic', { name: `${run} dynamic` })
      const { page } = adaSession
      await visit(page, '/collections/dynamic')
      await page.getByRole('link').filter({ hasText: `${run} dynamic` }).click()
      await page.waitForURL('**/collections/dynamic/*')
      await page.waitForLoadState('networkidle')

      expect(await page.getByRole('textbox', { name: 'name', exact: true }).inputValue()).toBe(`${run} dynamic`)
    })

    it('COL-3: lists only the collections the principal holds a grant on', async () => {
      expect(new Set(await catalog(carolSession.page))).toEqual(new Set(['test']))
    })

    it('COL-2: a name that resolves to nothing fails with collection/not-found', async () => {
      const response = await adaSession.page.goto(`/collections/missing-${run}`)

      expect(response?.status()).toBe(500)
      expect(server.output()).toContain('collection/not-found')
    })
  })

  describe('the listing', () => {
    let authorId: string
    let articleId: string
    const longTitle = `${run} long ${Array(200).fill('word').join(' ')}`

    beforeAll(async () => {
      authorId = await author('listed')
      articleId = await article(authorId, authorId)
      await fixture('articles', { title: longTitle, slug: `${run}-long`, isPublished: false, contributors: [], sections: [] })
    })

    it('LST-1: rows are one line high, cut short with their full text as title, under their field names', async () => {
      const { page } = adaSession
      await visit(page, '/collections/articles')
      const longRow = page.getByRole('link').filter({ hasText: `${run} long` })
      const shortRow = page.getByRole('link').filter({ hasText: `${run} article` }).first()
      await shown(longRow)
      const heightOf = async (row: Locator): Promise<number | undefined> => (await row.boundingBox())?.height

      expect(await heightOf(longRow)).toBe(await heightOf(shortRow))
      expect(await longRow.locator(`[title="${longTitle}"]`).count()).toBe(1)
      const labels = page.getByTestId('listing-header').locator(':scope > *')
      const cells = shortRow.locator(':scope > *')
      expect((await labels.first().innerText()).trim()).toBe('title')
      const labelEdges = await labels.evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().left)))
      const cellEdges = await cells.evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().left)))
      expect(cellEdges).toEqual(labelEdges)
    })

    it('LST-8: an object shows its fields, never [object Object]', async () => {
      const { page } = adaSession
      await visit(page, '/collections/articles')
      const row = page.getByRole('link').filter({ hasText: `${run} article` }).first()
      await shown(row)

      expect(await row.innerText()).toContain('readingTimeMinutes: 3')
      expect(await page.getByText('[object Object]').count()).toBe(0)
    })

    it('LST-7, LST-3: the filter narrows the rows, the count follows, Select all selects only the rows shown, and another collection opens unfiltered', async () => {
      const { page } = adaSession
      await visit(page, '/collections/authors')
      await shown(checkbox(page, authorId))
      await page.getByLabel('Filter documents').fill(`  ${run.toUpperCase()} LISTED `)

      await shown(page.getByText(/^1 of \d+ documents$/))
      expect(await page.locator('a[href^="authors/"]').count()).toBe(1)
      await button(page, 'Select all').click()
      await button(page, 'Delete').click()
      await shown(page.getByText('Do you want to delete one document?', { exact: true }))
      await button(page, 'No').click()
      await button(page, 'Unselect all').click()
      expect(await checkbox(page, authorId).getAttribute('aria-pressed')).toBe('false')

      await page.evaluate(() => {
        const link = document.createElement('a')
        link.href = '/collections/articles'
        link.textContent = 'to articles'
        document.body.append(link)
      })
      await page.getByRole('link', { name: 'to articles', exact: true }).click()
      await page.waitForURL('**/collections/articles')
      await shown(page.getByText(/^\d+ documents$/))
      expect(await page.getByLabel('Filter documents').inputValue()).toBe('')
    })

    it('LST-1: shows a header of field names and a row per document linking to it', async () => {
      const { page } = adaSession
      await visit(page, '/collections/authors')
      await shown(page.getByRole('heading', { name: 'Collection: authors' }))
      for (const field of ['id', 'name', 'role', 'avatar']) await shown(page.getByText(field, { exact: true }))

      const row = page.getByRole('link').filter({ hasText: `${run} listed` })
      expect(await row.getAttribute('href')).toBe(`authors/${authorId}`)
      await row.click()
      await page.waitForURL(`**/collections/authors/${authorId}`)
    })

    it('LST-1: omits a field hidden from the preview, and counts the items of an array', async () => {
      const { page } = adaSession
      await visit(page, '/collections/dynamic')
      await shown(page.getByText('shadowField', { exact: true }))
      expect(await page.getByText('hiddenInListing', { exact: true }).count()).toBe(0)

      await visit(page, '/collections/articles')
      const row = page.getByRole('link').filter({ hasText: `${run} article` })
      await shown(row)
      expect(await row.locator('[title="2 items"]').innerText()).toBe('2')
      expect(articleId).not.toBe('')
    })

    it('LST-2, LST-3: Delete appears before the selection control once something is selected', async () => {
      const { page } = adaSession
      await visit(page, '/collections/authors')
      await shown(checkbox(page, authorId))
      expect(await button(page, 'Delete').count()).toBe(0)
      expect(await left(button(page, 'Select all'))).toBeLessThan(await left(button(page, 'New document')))

      await checkbox(page, authorId).click()
      expect(await checkbox(page, authorId).getAttribute('aria-pressed')).toBe('true')
      expect(await left(button(page, 'Delete'))).toBeLessThan(await left(button(page, 'Unselect all')))
      expect(await left(button(page, 'Unselect all'))).toBeLessThan(await left(button(page, 'New document')))

      await checkbox(page, authorId).click()
      expect(await checkbox(page, authorId).getAttribute('aria-pressed')).toBe('false')
    })

    it('LST-3: Select all selects every row, and Unselect all clears them', async () => {
      const { page } = adaSession
      await visit(page, '/collections/authors')
      await shown(checkbox(page, authorId))
      await button(page, 'Select all').click()
      const pressed = await page.locator('button[aria-label^="Select "]').evaluateAll(boxes => boxes.map(box => box.getAttribute('aria-pressed')))
      expect(new Set(pressed)).toEqual(new Set(['true']))

      await button(page, 'Unselect all').click()
      expect(await checkbox(page, authorId).getAttribute('aria-pressed')).toBe('false')
    })

    it('LST-2: a principal without write or delete is offered neither', async () => {
      const id = await fixture('test', { name: `${run} readable` })
      const { page } = carolSession
      await visit(page, '/collections/test')
      await shown(checkbox(page, id))
      await checkbox(page, id).click()

      expect(await button(page, 'Delete').count()).toBe(0)
      expect(await button(page, 'New document').count()).toBe(0)
    })

    it('LST-4, DOC-7: deleting the selection asks with the count and removes the documents', async () => {
      const first = await author('doomed one')
      const second = await author('doomed two')
      const { page } = adaSession
      await visit(page, '/collections/authors')
      await checkbox(page, first).click()
      await checkbox(page, second).click()
      await button(page, 'Delete').click()
      await confirmWith(page, 'Do you want to delete 2 documents?')
      await shown(page.getByText('Deleted', { exact: true }))

      expect(await readDocument('authors', first)).toBeUndefined()
      expect(await readDocument('authors', second)).toBeUndefined()
      await expect.poll(async () => await page.getByRole('link').filter({ hasText: `${run} doomed` }).count(), { timeout: 30_000 }).toBe(0)
    })

    it('LST-6, DOC-5: New document creates the document and opens it', async () => {
      const { page } = adaSession
      await visit(page, '/collections/authors')
      await button(page, 'New document').click()
      const dialog = page.getByRole('dialog', { name: 'New document' })
      await dialog.getByLabel('name', { exact: true }).fill(`${run} created`)
      await dialog.getByRole('button', { name: 'Create', exact: true }).click()
      await page.waitForURL(/\/collections\/authors\/[^/]+$/)
      await shown(page.getByText('Document created', { exact: true }))

      const id = page.url().split('/').pop() ?? ''
      created.authors.push(id)
      expect(await readDocument('authors', id)).toMatchObject({ name: `${run} created` })
    })

    it('DOC-6, EDT-3: deleting from the document page removes it, returns to the listing, and asks nothing about unsaved changes', async () => {
      const id = await author('deleted alone')
      const { page } = adaSession
      const dialogs: string[] = []
      const record = async (dialog: Dialog): Promise<void> => {
        if (dialog.type() === 'beforeunload') return
        dialogs.push(dialog.message())
        await dialog.dismiss()
      }
      page.on('dialog', record)
      await openDocument(page, 'authors', id)
      await page.getByLabel('role', { exact: true }).fill('edited before deleting')
      await button(page, 'Delete').click()
      await confirmWith(page, 'This document will be deleted permanently.')
      await page.waitForURL(/\/collections\/authors\/?$/)
      await shown(page.getByText('Document deleted', { exact: true }))
      page.off('dialog', record)

      expect(dialogs).toEqual([])
      expect(await readDocument('authors', id)).toBeUndefined()
    })

    it('LST-2: in a picker, Confirm selection stands before every other control', async () => {
      const { page } = adaSession
      await visit(page, `/collections/authors?selectionId=${randomUUID()}`)
      await checkbox(page, authorId).click()

      expect(await left(button(page, 'Confirm selection'))).toBeLessThan(await left(button(page, 'Delete')))
      expect(await left(button(page, 'Delete'))).toBeLessThan(await left(button(page, 'Unselect all')))
    })

    it('LST-4: shows Deleting while deleting, and a failed deletion reports Deletion failed and keeps the documents', async () => {
      const id = await author('kept on failure')
      const { page } = adaSession
      await failDeletion(page, '/collections/authors')
      await visit(page, '/collections/authors')
      await checkbox(page, id).click()
      await button(page, 'Delete').click()
      await confirmWith(page, 'Do you want to delete one document?')
      await shown(page.getByText('Deleting', { exact: true }))
      await shown(page.getByText('Deletion failed', { exact: true }))

      expect(await readDocument('authors', id)).toBeDefined()
    })

    async function openNewDocument (page: Page): Promise<Locator> {
      await visit(page, '/collections/authors')
      await button(page, 'New document').click()
      const dialog = page.getByRole('dialog', { name: 'New document' })
      await dialog.getByLabel('name', { exact: true }).fill(`${run} attempted`)
      return dialog
    }

    it('LST-6: Create reads Creating... and is disabled while creating', async () => {
      const { page } = adaSession
      await answerCommand(page, 'createDoc', { delayMs: 1500 })
      const dialog = await openNewDocument(page)
      await dialog.getByRole('button', { name: 'Create', exact: true }).click()
      const creating = dialog.getByRole('button', { name: 'Creating...', exact: true })
      await shown(creating)

      expect(await creating.isDisabled()).toBe(true)
      await page.waitForURL(/\/collections\/authors\/[^/]+$/)
      created.authors.push(page.url().split('/').pop() ?? '')
    })

    it('LST-6: a failed result reports its text, or Failed to create document, and a failed request An error occurred', async () => {
      const { page } = adaSession
      await answerCommand(page, 'createDoc', { result: { status: 'fail', text: 'Refused by the test' } })
      const dialog = await openNewDocument(page)
      await dialog.getByRole('button', { name: 'Create', exact: true }).click()
      await shown(page.getByText('Refused by the test', { exact: true }))

      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await answerCommand(page, 'createDoc', { result: { status: 'fail', text: '' } })
      await dialog.getByRole('button', { name: 'Create', exact: true }).click()
      await shown(page.getByText('Failed to create document', { exact: true }))

      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await answerCommand(page, 'createDoc', { error: true })
      await dialog.getByRole('button', { name: 'Create', exact: true }).click()
      await shown(page.getByText('An error occurred', { exact: true }))
      expect(page.url()).toMatch(/\/collections\/authors\/?$/)
    })
  })

  describe('the document page', () => {
    let authorId: string
    let otherAuthorId: string
    let articleId: string

    beforeAll(async () => {
      authorId = await author('Ada Author')
      otherAuthorId = await author('Bob Author')
      articleId = await article(authorId, authorId)
    })

    it('EDT-1: names the collection and the document, offers Delete and Save, and records the visit', async () => {
      const { page } = adaSession
      await openDocument(page, 'articles', articleId)
      const heading = page.getByRole('heading', { level: 1 }).filter({ hasText: articleId })

      expect(await heading.innerText()).toMatch(new RegExp(`articles\\s*/\\s*${articleId}`))
      expect(await heading.getByRole('link', { name: 'articles' }).getAttribute('href')).toBe('/collections/articles')
      await shown(button(page, 'Delete'))
      await shown(page.getByRole('button', { name: 'Save' }))
      const activity = await page.evaluate(() => JSON.parse(localStorage.getItem('activityRecords') ?? '[]')[0])
      expect(activity).toMatchObject({ type: 'collections', collection: 'articles', document: articleId })
    })

    it('EDT-1: a reader is offered neither Save nor Delete', async () => {
      const id = await fixture('test', { name: `${run} read only` })
      const { page } = carolSession
      await openDocument(page, 'test', id)

      expect(await page.getByRole('button', { name: 'Save' }).count()).toBe(0)
      expect(await button(page, 'Delete').count()).toBe(0)
    })

    it('EDT-2, DOC-5: shows unsaved changes, and Ctrl+S saves them', async () => {
      const { page } = adaSession
      await openDocument(page, 'articles', articleId)
      await shown(page.getByText('Saved', { exact: true }))
      await page.getByLabel('slug', { exact: true }).fill(`${run}-edited`)
      await shown(page.getByText('Unsaved changes', { exact: true }))
      await page.keyboard.press('Control+s')
      await shown(page.getByText('Document updated', { exact: true }))
      await shown(page.getByText('Saved', { exact: true }))

      expect(await readDocument('articles', articleId)).toMatchObject({ slug: `${run}-edited` })
    })

    it('EDT-3: leaving with unsaved changes asks, and declining stays', async () => {
      const { page } = adaSession
      await openDocument(page, 'articles', articleId)
      await page.getByLabel('slug', { exact: true }).fill(`${run}-unsaved`)
      const collectionLink = page.getByRole('heading', { level: 1 }).getByRole('link', { name: 'articles' })
      const asked = page.waitForEvent('dialog')
      const declining = collectionLink.click()
      const dialog = await asked
      expect(dialog.type()).toBe('confirm')
      expect(dialog.message()).toBe('You have unsaved changes. Leave this page and discard them?')
      await dialog.dismiss()
      await declining

      expect(page.url()).toContain(`/collections/articles/${articleId}`)
      const again = page.waitForEvent('dialog')
      const accepting = collectionLink.click()
      await (await again).accept()
      await accepting
      await page.waitForURL(/\/collections\/articles\/?$/)
    })

    it('EDT-4, EDT-6: each field gets its control, labelled with its name and hint', async () => {
      const { page } = adaSession
      await openDocument(page, 'articles', articleId)

      await shown(page.getByRole('textbox', { name: 'title', exact: true }))
      await shown(page.getByRole('checkbox', { name: 'isPublished', exact: true }))
      await shown(page.getByRole('group', { name: /^author\s+→ authors$/ }))
      await shown(page.getByRole('group', { name: /^contributors\s+1 document · authors$/ }))
      await shown(page.getByRole('group', { name: /^sections\s+2 items$/ }))
      await shown(page.getByRole('group', { name: /^tags\s+0 items$/ }))
      await shown(page.getByRole('spinbutton', { name: 'readingTimeMinutes', exact: true }))

      await page.getByRole('button', { name: 'Generate UUID' }).click()
      expect(await page.getByRole('textbox', { name: 'id', exact: true }).inputValue()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })

    it('EDT-10: shows the markdown rendered as soon as the page is interactive', async () => {
      const id = await article(authorId, authorId)
      const { page } = adaSession
      await openDocument(page, 'articles', id)

      await shown(page.getByRole('heading', { name: 'Rendered heading', exact: true }))
    })

    it('EDT-11: list items are cards of position, variant and summary, and removing one asks first', async () => {
      const { page } = adaSession
      await openDocument(page, 'articles', articleId)
      await shown(page.getByRole('button', { name: `#1 hero ${run} headline` }))
      await shown(page.getByRole('button', { name: '#2 richText # Rendered heading' }))
      await shown(page.getByText('No items yet.', { exact: true }))

      const tags = page.getByRole('group', { name: /^tags\b/ })
      await tags.getByRole('button', { name: 'Add item' }).click()
      await shown(tags.getByRole('textbox'))
      await tags.getByRole('button', { name: 'Remove item 1' }).click()
      await confirmWith(page, 'Remove item #1?')
      await shown(page.getByText('No items yet.', { exact: true }))
    })

    it('EDT-11: an item is reordered by dragging its handle', async () => {
      const { page } = adaSession
      await openDocument(page, 'articles', articleId)
      const sections = page.getByRole('group', { name: /^sections\b/ })
      await page.setViewportSize({ width: 1280, height: 2400 })
      await dragFirstBelowSecond(page, sections.getByRole('button', { name: 'Drag item 1 to reorder' }))
      await page.setViewportSize({ width: 1280, height: 720 })

      await shown(page.getByRole('button', { name: '#1 richText # Rendered heading' }))
      await shown(page.getByRole('button', { name: `#2 hero ${run} headline` }))
    })

    it('EDT-11: Add item is disabled once the list holds maxItems', async () => {
      const id = await fixture('dynamic', { name: `${run} limited`, limited: [] })
      const { page } = adaSession
      await openDocument(page, 'dynamic', id)
      const limited = page.getByRole('group', { name: /^limited\b/ })
      await limited.getByRole('button', { name: 'Add item' }).click()

      expect(await limited.getByRole('button', { name: 'Add item' }).isDisabled()).toBe(true)
    })

    it('EDT-12, DOC-5: choosing a variant keeps only its fields and sets the discriminator', async () => {
      const { page } = adaSession
      await openDocument(page, 'articles', articleId)
      const sections = page.getByRole('group', { name: /^sections\b/ })
      await sections.getByText('richText', { exact: true }).first().click()
      await shown(page.getByRole('button', { name: '#1 richText' }))
      await page.getByRole('button', { name: 'Save' }).click()
      await shown(page.getByText('Document updated', { exact: true }))

      const stored = await readDocument('articles', articleId) as { sections: Array<Record<string, unknown>> }
      expect(stored.sections[0].type).toBe('richText')
      expect(stored.sections[0]).not.toHaveProperty('headline')
    })

    it('PCK-1, PCK-2, LST-5: references are picked in a second tab, which starts from the current value', async () => {
      const { context, page } = adaSession
      await openDocument(page, 'articles', articleId)
      const contributors = page.getByRole('group', { name: /^contributors\b/ })
      const link = contributors.getByRole('link', { name: 'Edit selection' })
      expect(await link.getAttribute('href')).toMatch(/^\/collections\/authors\?selectionId=[0-9a-f-]{36}$/)
      expect(await link.getAttribute('target')).toBe('_blank')

      const opened = context.waitForEvent('page')
      await link.click()
      const picker = await opened
      await shown(checkbox(picker, authorId))
      await picker.waitForFunction(id => document.querySelector(`[aria-label="Select ${id}"]`)?.getAttribute('aria-pressed') === 'true', authorId)
      await checkbox(picker, otherAuthorId).click()
      const closed = picker.waitForEvent('close')
      await button(picker, 'Confirm selection').click()
      await closed

      await shown(contributors.getByText(otherAuthorId, { exact: true }))
      await shown(contributors.getByText(authorId, { exact: true }))
    })

    it('LST-3, LST-5, PCK-4: a single reference is picked alone, shown with a link to it, and removed', async () => {
      const { context, page } = adaSession
      await openDocument(page, 'articles', articleId)
      const field = page.getByRole('group', { name: /^author\b/ })
      const open = field.getByRole('link', { name: `Open ${authorId}` })
      expect(await open.getAttribute('href')).toBe(`/collections/authors/${authorId}`)
      expect(await open.getAttribute('target')).toBe('_blank')
      await shown(field.getByText('authors', { exact: true }))

      await field.getByRole('button', { name: `Remove ${authorId}` }).click()
      const opened = context.waitForEvent('page')
      await field.getByRole('link', { name: 'Choose from authors' }).click()
      const picker = await opened
      await checkbox(picker, otherAuthorId).click()
      expect(await checkbox(picker, authorId).count()).toBe(0)
      const closed = picker.waitForEvent('close')
      await button(picker, 'Confirm selection').click()
      await closed

      await shown(field.getByText(otherAuthorId, { exact: true }))
    })

    it('PCK-1, PCK-4: a file is shown by name and bucket, and removing it offers storage', async () => {
      const { page } = adaSession
      await openDocument(page, 'articles', articleId)
      const field = page.getByRole('group', { name: /^socialShareImage\b/ })
      await shown(field.getByText('e2e/cover.png', { exact: true }))
      await shown(field.getByText(BUCKET, { exact: true }))

      await field.getByRole('button', { name: 'Remove e2e/cover.png' }).click()
      const choose = field.getByRole('link', { name: 'Choose a file from storage' })
      expect(await choose.getAttribute('href')).toMatch(/^\/storage\?selectionId=[0-9a-f-]{36}$/)
    })

    it('EDT-1: a failed deletion reports Document deletion failed and keeps the document', async () => {
      const id = await author('kept on page failure')
      const { page } = adaSession
      await failDeletion(page, `/collections/authors/${id}`)
      await openDocument(page, 'authors', id)
      await button(page, 'Delete').click()
      await confirmWith(page, 'This document will be deleted permanently.')
      await shown(page.getByText('Document deletion failed', { exact: true }))

      expect(await readDocument('authors', id)).toBeDefined()
    })

    it('EDT-2: Save reads Saving… and is disabled while saving, and ⌘+S saves too', async () => {
      const { page } = adaSession
      await answerCommand(page, 'updateDoc', { delayMs: 1500 })
      await openDocument(page, 'articles', articleId)
      await page.getByLabel('slug', { exact: true }).fill(`${run}-meta`)
      await page.keyboard.press('Meta+s')
      const saving = page.getByRole('button', { name: 'Saving…' })
      await shown(saving)

      expect(await saving.isDisabled()).toBe(true)
      await shown(page.getByText('Document updated', { exact: true }))
      expect(await readDocument('articles', articleId)).toMatchObject({ slug: `${run}-meta` })
    })

    it('EDT-2: a failed result reports its text, or Failed to update document, and a failed request An error occurred', async () => {
      const { page } = adaSession
      await openDocument(page, 'articles', articleId)
      await page.getByLabel('slug', { exact: true }).fill(`${run}-refused`)
      for (const [answer, report] of [
        [{ result: { status: 'fail', text: 'Refused by the test' } }, 'Refused by the test'],
        [{ result: { status: 'fail', text: '' } }, 'Failed to update document'],
        [{ error: true }, 'An error occurred']
      ] as Array<[CommandAnswer, string]>) {
        await page.unrouteAll({ behavior: 'ignoreErrors' })
        await answerCommand(page, 'updateDoc', answer)
        await page.getByRole('button', { name: 'Save' }).click()
        await shown(page.getByText(report, { exact: true }))
      }

      await shown(page.getByText('Unsaved changes', { exact: true }))
      expect(await readDocument('articles', articleId)).not.toMatchObject({ slug: `${run}-refused` })
    })

    it('EDT-3: leaving the page with unsaved changes asks the browser to prompt', async () => {
      const page = await adaSession.context.newPage()
      await openDocument(page, 'articles', articleId)
      await page.getByLabel('slug', { exact: true }).fill(`${run}-abandoned`)
      const asked = page.waitForEvent('dialog')
      const closing = page.close({ runBeforeUnload: true })
      const dialog = await asked

      expect(dialog.type()).toBe('beforeunload')
      await dialog.accept()
      await closing
    })

    it('EDT-6: uuid, text, markdown, enum, number, file and files fields carry their hints', async () => {
      const { page } = adaSession
      await openDocument(page, 'articles', await article(authorId, authorId))
      for (const hint of ['UUID', 'long text', 'markdown', 'choice', 'number', 'file']) await shown(page.getByText(hint, { exact: true }))

      const id = await fixture('dynamic', { name: `${run} hinted`, gallery: [{ bucket: BUCKET, name: FILES[0] }] })
      await openDocument(page, 'dynamic', id)
      await shown(page.getByRole('group', { name: /^gallery\s+1 of 1 file$/ }))
    })

    it('EDT-11: an item is reordered by keyboard', async () => {
      const { page } = adaSession
      await openDocument(page, 'articles', await article(authorId, authorId))
      const sections = page.getByRole('group', { name: /^sections\b/ })
      await sections.getByRole('button', { name: 'Drag item 1 to reorder' }).focus()
      await page.keyboard.press('Enter')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')

      await shown(sections.getByRole('button', { name: '#1 richText' }))
      await shown(sections.getByRole('button', { name: '#2 hero' }))
    })

    async function openStoragePicker (page: Page, field: Locator, linkName: string): Promise<Page> {
      const opened = adaSession.context.waitForEvent('page')
      await field.getByRole('link', { name: linkName }).click()
      const picker = await opened
      await picker.locator(`a[href^="storage/${BUCKET}/contents"]`).click()
      await shown(picker.getByRole('button', { name: `select-${FILES[0]}`, exact: true }))
      return picker
    }

    it('PCK-2, PCK-4: files are picked in the storage browser up to maxItems, then edited and cleared', async () => {
      const id = await fixture('dynamic', { name: `${run} gallery`, gallery: [] })
      const { page } = adaSession
      await openDocument(page, 'dynamic', id)
      const gallery = page.getByRole('group', { name: /^gallery\b/ })
      const picker = await openStoragePicker(page, gallery, 'Choose files from storage')
      await picker.getByRole('button', { name: `select-${FILES[0]}`, exact: true }).click()
      const second = picker.getByRole('button', { name: `select-${FILES[1]}`, exact: true })
      await second.click()

      expect(await second.getAttribute('aria-pressed')).toBe('false')
      const closed = picker.waitForEvent('close')
      await picker.getByRole('button', { name: 'Confirm selection', exact: true }).click()
      await closed

      await shown(gallery.getByText(FILES[0], { exact: true }))
      await shown(gallery.getByRole('link', { name: 'Edit selection' }))
      await gallery.getByRole('button', { name: 'Clear all', exact: true }).click()
      await shown(gallery.getByRole('link', { name: 'Choose files from storage' }))
    })

    it('PCK-2: a picker whose field is gone is not answered, and stays open', async () => {
      const id = await fixture('dynamic', { name: `${run} abandoned picker`, gallery: [] })
      const { page } = adaSession
      await openDocument(page, 'dynamic', id)
      const picker = await openStoragePicker(page, page.getByRole('group', { name: /^gallery\b/ }), 'Choose files from storage')
      await visit(page, '/collections/test')
      await picker.getByRole('button', { name: `select-${FILES[0]}`, exact: true }).click()
      await picker.getByRole('button', { name: 'Confirm selection', exact: true }).click()
      await pause(2000)

      expect(picker.isClosed()).toBe(false)
      await picker.close()
    })
  })
})
