import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { Dialog, Locator, Page } from 'playwright'
import { startServer, type RunningServer, type User } from './server'
import { enabled, removeInstance, writeCollectionDefinition } from './bucket'
import { launchBrowser, closeBrowser, signedInSession, type Session } from './browser'
import { createDocument, readDocument, deleteDocuments } from './database'

const password = (): string => randomBytes(18).toString('base64url')
const run = randomBytes(4).toString('hex')

const ada: User = { subject: 'e2e-ada', email: 'ada@e2e.test', password: password() }
const carol: User = { subject: 'e2e-carol', email: 'carol@e2e.test', password: password() }

const SETUP_TIMEOUT_MS = 120_000
const TEST_TIMEOUT_MS = 60_000
const BUCKET = process.env.GENOACMS_TEST_GCP_BUCKET ?? 'genoacms-tests'

/** A dynamic definition with the name of a configured collection: it replaces it (COL-2). */
const shadowOfTest = {
  name: 'test',
  primaryKey: { key: 'id', schema: { type: 'string' } },
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      shadowField: { type: 'string' },
      hiddenInListing: { type: 'string' },
      limited: { type: 'array', maxItems: 1, items: { type: 'string' } }
    }
  },
  uiSchema: { hiddenInListing: { showPreview: false } }
}

let server: RunningServer
let adaSession: Session
let carolSession: Session
const created: Record<string, string[]> = { authors: [], articles: [], test: [] }

const fixture = async (collection: 'authors' | 'articles' | 'test', data: Record<string, unknown>): Promise<string> => {
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

async function catalog (page: Page): Promise<string[]> {
  await page.goto('/collections')
  await shown(page.locator('a[href="/collections/test"]'))
  const hrefs = await page.locator('a[href^="/collections/"]').evaluateAll(links => links.map(link => link.getAttribute('href') ?? ''))
  return hrefs.map(href => href.replace('/collections/', ''))
}

async function openDocument (page: Page, collection: string, id: string): Promise<void> {
  await page.goto(`/collections/${collection}/${id}`)
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
    await writeCollectionDefinition(shadowOfTest)
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
  }, SETUP_TIMEOUT_MS)

  describe('the catalog', () => {
    it('COL-2: a dynamic definition replaces the configured one of its name', async () => {
      const { page } = adaSession
      await page.goto('/collections/test')
      await shown(page.getByText('shadowField', { exact: true }))

      expect(await page.getByText('isA', { exact: true }).count()).toBe(0)
    })

    it('COL-3: lists only the collections the principal holds a grant on', async () => {
      expect(new Set(await catalog(carolSession.page))).toEqual(new Set(['test']))
    })
  })

  describe('the listing', () => {
    let authorId: string
    let articleId: string

    beforeAll(async () => {
      authorId = await author('listed')
      articleId = await article(authorId, authorId)
    })

    it('LST-1: shows a header of field names and a row per document linking to it', async () => {
      const { page } = adaSession
      await page.goto('/collections/authors')
      await shown(page.getByRole('heading', { name: 'Collection: authors' }))
      for (const field of ['id', 'name', 'role', 'avatar']) await shown(page.getByText(field, { exact: true }))

      const row = page.getByRole('link').filter({ hasText: `${run} listed` })
      expect(await row.getAttribute('href')).toBe(`authors/${authorId}`)
      await row.click()
      await page.waitForURL(`**/collections/authors/${authorId}`)
    })

    it('LST-1: omits a field hidden from the preview, and counts the items of an array', async () => {
      const { page } = adaSession
      await page.goto('/collections/test')
      await shown(page.getByText('shadowField', { exact: true }))
      expect(await page.getByText('hiddenInListing', { exact: true }).count()).toBe(0)

      await page.goto('/collections/articles')
      const row = page.getByRole('link').filter({ hasText: `${run} article` })
      await shown(row)
      expect(await row.innerText()).toContain('2 items')
      expect(articleId).not.toBe('')
    })

    it('LST-2, LST-3: Delete appears before the selection control once something is selected', async () => {
      const { page } = adaSession
      await page.goto('/collections/authors')
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
      await page.goto('/collections/authors')
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
      await page.goto('/collections/test')
      await shown(checkbox(page, id))
      await checkbox(page, id).click()

      expect(await button(page, 'Delete').count()).toBe(0)
      expect(await button(page, 'New document').count()).toBe(0)
    })

    it('LST-4, DOC-7: deleting the selection asks with the count and removes the documents', async () => {
      const first = await author('doomed one')
      const second = await author('doomed two')
      const { page } = adaSession
      await page.goto('/collections/authors')
      await checkbox(page, first).click()
      await checkbox(page, second).click()
      await button(page, 'Delete').click()
      await confirmWith(page, 'Do you want to delete 2 documents?')
      await shown(page.getByText('Deleted', { exact: true }))

      expect(await readDocument('authors', first)).toBeUndefined()
      expect(await readDocument('authors', second)).toBeUndefined()
      expect(await page.getByRole('link').filter({ hasText: `${run} doomed` }).count()).toBe(0)
    })

    it('LST-6, DOC-5: New document creates the document and opens it', async () => {
      const { page } = adaSession
      await page.goto('/collections/authors')
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
      const heading = page.getByRole('heading', { level: 1 })

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
      const id = await fixture('test', { name: `${run} limited`, limited: [] })
      const { page } = adaSession
      await openDocument(page, 'test', id)
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

    it('LST-5, PCK-4: a single reference is picked alone, shown with a link to it, and removed', async () => {
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
  })
})
