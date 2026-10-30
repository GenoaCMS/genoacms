import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isRedirect } from '@sveltejs/kit'
import { memory } from '$lib/script/testing/memoryStorage'
import {
  attribute, header, node, pageEntry, storeComponent, storePublishedComponent, storePublication, storePage,
  storedPage, publicationIdOf, entryPath, treePath, headerPath, pointerPath
} from '$lib/script/testing/components'
import { captureConsole } from '$lib/script/testing/host'
import { principal, runAction, type Parsed } from '$lib/script/testing/requests'

vi.mock('$lib/script/storage/providers.server', async () => {
  const { memoryProviders } = await import('$lib/script/testing/memoryStorage')
  return {
    ...memoryProviders,
    getPublicURL: async (reference: { bucket: string, name: string }) => {
      if (reference.name === 'unreachable') throw new Error('no public URL')
      return await memoryProviders.getPublicURL(reference)
    }
  }
})
vi.mock('$lib/script/signing/keyResolution.server', async () => (await import('$lib/script/testing/signingKeys')).testKeyResolution)

const pagesList = await import('../../../../routes/(admin)/components/pages/+page.server')
const pageLayout = await import('../../../../routes/(admin)/components/pages/[pageName]/+layout.server')
const pageRoot = await import('../../../../routes/(admin)/components/pages/[pageName]/+page.server')
const nodeRoute = await import('../../../../routes/(admin)/components/pages/[pageName]/[nodeUid]/+page.server')
const { getReadablePageTree } = await import('./tree/io.server')
const { getUserPageEntry, generateUserReadablePageTree } = await import('./user.server')
const { deletePageEntry } = await import('./page.server')

const editor = principal(['*'])

const hero = header('0b6f5a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b', 'Hero', [
  attribute.string('heading-uid', 'heading', { default: 'Hello' })
])
const [HEADING] = hero.attributeOrder

const onNode = async (action: string, fields: Record<string, string>, nodeUid = 'n1', auth = editor, pageName = 'home') =>
  await runAction(nodeRoute.actions, action, fields, { auth, params: { pageName, nodeUid }, path: `/components/pages/${pageName}/${nodeUid}` })
const versionOf = (name = 'home'): string => memory.versionOf(entryPath(name)) as string

async function outcomeOf (run: () => Promise<unknown>): Promise<Parsed> {
  try {
    return { returned: await run() }
  } catch (error) {
    return { thrown: error }
  }
}

const loadLayout = async (pageName: string, auth = editor): Promise<Parsed> =>
  await pageLayout.load({ params: { pageName }, locals: { auth }, parent: async () => ({ composableComponents: [] }), depends: () => {} } as never)

beforeEach(() => {
  memory.clear()
  storePublishedComponent(hero)
  storePage(pageEntry('home', 'n1', [node('n1', hero, { [HEADING]: 'first' })]))
})

afterEach(() => { vi.restoreAllMocks() })

describe('a page entry', () => {
  it('PGE-1: is stored with its name, preview URL, contents, history and a lastModified set on every write', async () => {
    await runAction(pagesList.actions, 'createPage', { name: 'about', componentUID: hero.uid }, { auth: editor })

    const entry = storedPage('about')
    expect(Object.keys(entry).sort()).toEqual(['contents', 'future', 'history', 'lastModified', 'name', 'previewURL'])
    expect(entry).toMatchObject({ name: 'about', previewURL: '', history: [], future: [] })
    expect(Object.keys(entry.contents).sort()).toEqual(['nodes', 'rootNodeUid'])
    const root = entry.contents.nodes[entry.contents.rootNodeUid]
    expect(root.uid).toBe(entry.contents.rootNodeUid)
    expect(root.entryReference).toBe(hero.uid)
    expect(root.data[HEADING]).toMatchObject({ uid: HEADING, name: 'heading', type: 'string', value: 'Hello' })
    expect(new Date(entry.lastModified).toISOString()).toBe(entry.lastModified)

    expect(storedPage('home').lastModified).toBe(new Date(0).toISOString())
    await onNode('changePreviewURL', { value: 'https://example.com/', version: versionOf() })
    expect(new Date(storedPage('home').lastModified).getTime()).toBeGreaterThan(Date.now() - 60_000)
  })

  it('PGE-1: a slot\'s value lists node uids of the same page', async () => {
    const section = header('3e9c8d5b-4f60-4182-8d2e-3f4a5b6c7d8e', 'Section', [attribute.components('children-uid', 'children')])
    storePublishedComponent(section)
    storePage(pageEntry('nested', 'root', [node('root', section)]))

    await onNode('addChildNode', { componentUID: hero.uid, attributeUID: 'children-uid', version: versionOf('nested') }, 'root', editor, 'nested')

    const entry = storedPage('nested')
    const slot = entry.contents.nodes.root.data['children-uid'].value
    expect(slot).toHaveLength(1)
    expect(Object.keys(entry.contents.nodes)).toContain(slot[0])
  })
})

describe('opening a page', () => {
  it('PGE-3: /components/pages lists the entry names', async () => {
    storePage(pageEntry('about', 'n1', [node('n1', hero)]))

    const listed = await pagesList.load({ locals: { auth: editor } } as never) as Parsed

    expect([...listed.pages].sort()).toEqual(['about', 'home'])
  })

  it('PGE-3: a page redirects 307 to its root node, and so does a node uid the page lacks', async () => {
    const page = (await loadLayout('home')).page

    const root = await outcomeOf(async () => await pageRoot.load({ parent: async () => ({ page }) } as never))
    expect(isRedirect(root.thrown)).toBe(true)
    expect(root.thrown).toMatchObject({ status: 307, location: 'home/n1' })

    const missing = await outcomeOf(async () => await nodeRoute.load({ params: { nodeUid: 'nowhere' }, parent: async () => ({ page }) } as never))
    expect(missing.thrown).toMatchObject({ status: 307, location: 'n1' })

    const present = await nodeRoute.load({ params: { nodeUid: 'n1' }, parent: async () => ({ page }) } as never)
    expect(present.node.uid).toBe('n1')
  })

  it('PGE-3: reading rebuilds each node from its component\'s current header', async () => {
    const stored = node('n1', hero, { [HEADING]: 'kept' })
    stored.name = 'stale name'
    stored.data[HEADING].name = 'stale attribute name'
    stored.data[HEADING].schema = { stale: true }
    stored.data.removed = { uid: 'removed', name: 'removed', type: 'string', value: 'gone' }
    storePage(pageEntry('home', 'n1', [stored]))
    const changed = header(hero.uid, 'Hero 2', [
      attribute.string('heading-uid', 'headline', { default: 'Hello' }),
      attribute.number('count-uid', 'count'),
      attribute.boolean('flag-uid', 'flag', { default: true })
    ])
    storeComponent(changed)

    const { page } = await loadLayout('home')

    const read = page.contents.nodes.n1
    expect(read.name).toBe('Hero 2')
    expect(Object.keys(read.data).sort()).toEqual(['count-uid', 'flag-uid', 'heading-uid'])
    expect(read.data['heading-uid']).toMatchObject({ name: 'headline', value: 'kept', schema: changed.attributes['heading-uid'].schema })
    expect(read.data['count-uid']).toMatchObject({ name: 'count', type: 'number', value: 0 })
    expect(read.data['flag-uid']).toMatchObject({ type: 'boolean', value: true })
  })

  it('PGE-3: an entry that cannot be read answers 404 No page named', async () => {
    memory.set(entryPath('broken'), 'not flatted')

    for (const name of ['nobody', 'broken']) {
      const outcome = await outcomeOf(async () => await loadLayout(name))
      expect(outcome.thrown, name).toMatchObject({ status: 404, body: { message: `No page named "${name}"` } })
    }
  })

  it('PGE-3: an entry with a node whose component has no header answers 404 No page named', async () => {
    const orphan = header('0d0d0d0d-1c3d-4e5f-8a9b-0c1d2e3f4a5b', 'Gone', [attribute.string('a', 'a')])
    storePage(pageEntry('orphaned', 'n1', [node('n1', orphan)]))

    const outcome = await outcomeOf(async () => await loadLayout('orphaned'))

    expect(outcome.thrown).toMatchObject({ status: 404, body: { message: 'No page named "orphaned"' } })
  })
})

describe('the preview URL', () => {
  it('PGE-6: is written conditionally on the version, without recording a step', async () => {
    const read = versionOf()

    const changed = await onNode('changePreviewURL', { value: 'https://example.com/home', version: read })
    expect(changed.status).toBeLessThan(400)
    expect(storedPage('home').previewURL).toBe('https://example.com/home')
    expect(storedPage('home').history).toEqual([])

    const stale = await onNode('changePreviewURL', { value: 'https://example.com/other', version: read })
    expect(stale.status).toBe(409)
    expect(stale.data.reason.startsWith('conflict/modified-since:')).toBe(true)
    expect(storedPage('home').previewURL).toBe('https://example.com/home')
  })

  it('PGE-6: without value or version it fails with 400 no-diff', async () => {
    const before = memory.snapshot()

    expect(await onNode('changePreviewURL', { version: versionOf() })).toEqual({ status: 400, data: { reason: 'no-diff' } })
    expect(await onNode('changePreviewURL', { value: 'https://example.com/' })).toEqual({ status: 400, data: { reason: 'no-diff' } })
    expect(memory.snapshot()).toEqual(before)
  })
})

describe('undoing and redoing a page', () => {
  const edit = async (heading: string) =>
    await onNode('update', { componentNode: JSON.stringify(node('n1', hero, { [HEADING]: heading })), version: versionOf() })

  it('PGE-7: undo and redo step the history over contents', async () => {
    await edit('second')
    expect(storedPage('home').contents.nodes.n1.data[HEADING].value).toBe('second')

    expect((await onNode('undo', { version: versionOf() })).status).toBeLessThan(400)
    expect(storedPage('home').contents.nodes.n1.data[HEADING].value).toBe('first')
    expect(storedPage('home').future).toHaveLength(1)

    expect((await onNode('redo', { version: versionOf() })).status).toBeLessThan(400)
    expect(storedPage('home').contents.nodes.n1.data[HEADING].value).toBe('second')
    expect(storedPage('home').history).toHaveLength(1)
  })

  it('PGE-7: the entry is written, conditionally on the version, also when there was nothing to step', async () => {
    const read = versionOf()

    expect((await onNode('undo', { version: read })).status).toBeLessThan(400)
    expect(versionOf()).not.toBe(read)
    expect((await onNode('redo', { version: versionOf() })).status).toBeLessThan(400)

    const stale = await onNode('undo', { version: read })
    expect(stale.status).toBe(409)
    expect(stale.data.reason.startsWith('conflict/modified-since:')).toBe(true)
  })

  it('PGE-7: without a version it fails with 400 no-version', async () => {
    expect(await onNode('undo', {})).toEqual({ status: 400, data: { reason: 'no-version' } })
    expect(await onNode('redo', {})).toEqual({ status: 400, data: { reason: 'no-version' } })
  })
})

describe('deleting pages', () => {
  const selection = (names: string[]) => ({ ids: JSON.stringify(names), names: JSON.stringify(names), confirmation: names.join(', ') })
  const deleteSelected = async (names: string[]) =>
    await runAction(pagesList.actions, 'deleteSelected', selection(names), { auth: editor })

  it('PGE-8: removes the entry and then its published tree', async () => {
    await generateUserReadablePageTree(editor, await getUserPageEntry(editor, 'home'))
    expect(memory.has(treePath('home'))).toBe(true)

    await deletePageEntry('home')

    expect(memory.has(entryPath('home'))).toBe(false)
    expect(memory.has(treePath('home'))).toBe(false)
  })

  it('PGE-8: a failure to remove the entry propagates', async () => {
    memory.set(treePath('nobody'), '{}')

    await expect(deletePageEntry('nobody')).rejects.toThrow()
    expect(memory.has(treePath('nobody'))).toBe(true)
  })

  it('PGE-8: a failure to remove the tree is logged as a warning and the deletion succeeds', async () => {
    const lines = captureConsole()

    await expect(deletePageEntry('home')).resolves.toBeUndefined()

    expect(memory.has(entryPath('home'))).toBe(false)
    expect(lines.some(line => line.startsWith('[genoacms:pages] deleted the entry for home but not its readable tree: '))).toBe(true)
  })

  it('PGE-8: deleteSelected deletes by name', async () => {
    storePage(pageEntry('about', 'n1', [node('n1', hero)]))

    expect(await deleteSelected(['home', 'about'])).toEqual({ status: 200, data: { success: true } })

    expect(memory.names().filter(name => name.startsWith('.genoacms/pages/'))).toEqual([])
  })

  it('PGE-8: deleteSelected refuses a malformed, empty, mismatched or unconfirmed selection with 400', async () => {
    const run = async (fields: Record<string, string>) => await runAction(pagesList.actions, 'deleteSelected', fields, { auth: editor })
    const good = selection(['home'])

    expect(await run({ ...good, ids: 'x' })).toEqual({ status: 400, data: { reason: 'selection/malformed' } })
    expect(await run({ ids: '[]', names: '[]', confirmation: '' })).toEqual({ status: 400, data: { reason: 'selection/empty' } })
    expect(await run({ ...good, names: '["home","x"]' })).toEqual({ status: 400, data: { reason: 'selection/mismatched' } })
    expect(await run({ ...good, confirmation: 'other' })).toEqual({ status: 400, data: { reason: 'selection/not-confirmed' } })
    expect(memory.has(entryPath('home'))).toBe(true)
  })

  it('PGE-8: deleteSelected stops at a failure as 409 selection/partial', async () => {
    const outcome = await deleteSelected(['home', 'nobody'])

    expect(outcome.status).toBe(409)
    expect(outcome.data.reason.startsWith('selection/partial: removed 1 of 2; ')).toBe(true)
    expect(memory.has(entryPath('home'))).toBe(false)
  })
})

describe('pages and the components they use', () => {
  it('PGE-9: changing a component changes no page; reading applies PGE-3 and building applies TRE-2', async () => {
    const before = memory.text(entryPath('home'))
    const changed = header(hero.uid, 'Hero renamed', [
      attribute.string('heading-uid', 'headline'),
      attribute.number('count-uid', 'count')
    ])
    storeComponent(changed)

    expect(memory.text(entryPath('home'))).toBe(before)

    const { page } = await loadLayout('home')
    expect(page.contents.nodes.n1.name).toBe('Hero renamed')
    expect(Object.keys(page.contents.nodes.n1.data).sort()).toEqual(['count-uid', 'heading-uid'])
    expect(memory.text(entryPath('home'))).toBe(before)

    await generateUserReadablePageTree(editor, await getUserPageEntry(editor, 'home'))
    expect((await getReadablePageTree('home'))?.component).toBe('Hero renamed')
  })

  it('PGE-9: nothing records on a component which pages use it, except their published trees', async () => {
    const component = (): Map<string, string | undefined> =>
      new Map([headerPath(hero.uid), pointerPath(hero.uid)].map(path => [path, memory.text(path)]))
    const before = component()

    await runAction(pagesList.actions, 'createPage', { name: 'about', componentUID: hero.uid }, { auth: editor })
    await generateUserReadablePageTree(editor, await getUserPageEntry(editor, 'about'))

    expect(component()).toEqual(before)
    expect(memory.names().filter(name => name.includes(hero.uid))).toEqual([headerPath(hero.uid), pointerPath(hero.uid)])
  })
})

const FIRST = '11111111-1111-4111-8111-111111111111'
const SECOND = '22222222-2222-4222-8222-222222222222'

describe('building a page', () => {
  it('TRE-1: writes a signed pageTree envelope of the root node over any tree there, which records neither who nor when', async () => {
    memory.set(treePath('home'), 'a previous tree')

    const built = await onNode('updateAndGenerateTree', { componentNode: JSON.stringify(node('n1', hero, { [HEADING]: 'built' })), version: versionOf() })

    expect(built.status).toBeLessThan(400)
    const stored = memory.json(treePath('home'))
    expect(JSON.stringify(stored)).toContain('genoacms.pageTree.v1')
    expect(stored.payload).toEqual({
      component: 'Hero', type: 'prebuilt', uid: hero.uid, publicationId: publicationIdOf(hero.uid), data: { heading: 'built' }
    })
    expect(JSON.stringify(stored)).not.toContain('subject-1')
    expect(await getReadablePageTree('home')).toEqual(stored.payload)
  })

  it('TRE-1: reading back a tree that does not verify fails with pages/tree-unverifiable, and an absent one is none', async () => {
    await generateUserReadablePageTree(editor, await getUserPageEntry(editor, 'home'))
    const stored = memory.json(treePath('home'))
    memory.set(treePath('home'), JSON.stringify({ ...stored, payload: { ...stored.payload, component: 'Forged' } }))

    await expect(getReadablePageTree('home')).rejects.toThrow(/^pages\/tree-unverifiable:/)
    expect(await getReadablePageTree('never-built')).toBeNull()
  })

  it('TRE-2: a node of a published component carries its uid and the pointer\'s publicationId, read when the page is built', async () => {
    storePublication(hero.uid, FIRST)
    await generateUserReadablePageTree(editor, await getUserPageEntry(editor, 'home'))
    expect(await getReadablePageTree('home')).toMatchObject({ component: 'Hero', type: 'prebuilt', uid: hero.uid, publicationId: FIRST })

    storePublication(hero.uid, SECOND)
    expect(await getReadablePageTree('home')).toMatchObject({ publicationId: FIRST })
  })

  it('TRE-2: a node of a component never published carries neither, and a dynamic one says so', async () => {
    const draft = header('6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'Draft', [], 'dynamic')
    storeComponent(draft)
    storePage(pageEntry('drafts', 'n1', [node('n1', draft)]))

    await generateUserReadablePageTree(editor, await getUserPageEntry(editor, 'drafts'))

    const tree = await getReadablePageTree('drafts') as Parsed
    expect(tree).toEqual({ component: 'Draft', type: 'dynamic', data: {} })
    expect(tree).not.toHaveProperty('uid')
    expect(tree).not.toHaveProperty('publicationId')
  })
})

describe('values in the tree', () => {
  const everything = header('9d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6', 'Everything', [
    attribute.boolean('b', 'flag'),
    attribute.number('n', 'count'),
    attribute.string('s', 'title'),
    attribute.string('t', 'blurb', {}, 'text'),
    attribute.string('m', 'body', {}, 'markdown'),
    attribute.string('r', 'rich', {}, 'richText'),
    attribute.link('l', 'links'),
    attribute.storageResource('sr', 'files'),
    attribute.components('c', 'slot')
  ])
  const leaf = header('5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d', 'Leaf', [attribute.string('x', 'text')])

  const build = async (values: Parsed, extra: Parsed[] = []): Promise<Parsed> => {
    storePublishedComponent(everything)
    storePublishedComponent(leaf)
    storePage(pageEntry('values', 'root', [node('root', everything, values), ...extra]))
    await generateUserReadablePageTree(editor, await getUserPageEntry(editor, 'values'))
    return (await getReadablePageTree('values') as Parsed).data
  }

  it('TRE-3: boolean, number, string and text are stored as they are', async () => {
    const data = await build({ b: true, n: 4.5, s: 'a title', t: 'some\ntext' })

    expect(data).toMatchObject({ flag: true, count: 4.5, title: 'a title', blurb: 'some\ntext' })
  })

  it('TRE-3: markdown becomes sanitized HTML and richText becomes an empty string', async () => {
    const data = await build({ m: '**bold** <script>alert(1)</script>', r: 'ignored' })

    expect(data.body).toContain('<strong>bold</strong>')
    expect(data.body).not.toContain('<script')
    expect(data.rich).toBe('')
  })

  it('TRE-3: a link becomes one URL per link, in order', async () => {
    storePage(pageEntry('target', 'n1', [node('n1', leaf)]))
    const target = storedPage('target')
    storePage({ ...target, previewURL: 'https://site.test/target' })

    const data = await build({
      l: [
        { isExternal: true, url: 'https://example.com/' },
        { isExternal: false, pageName: 'target' },
        { isExternal: true },
        { isExternal: false, pageName: '' }
      ]
    })

    expect(data.links).toEqual(['https://example.com/', 'https://site.test/target', '', ''])
  })

  it('TRE-3: an internal link to a page with no entry fails the build', async () => {
    storePublishedComponent(everything)
    storePage(pageEntry('values', 'root', [node('root', everything, { l: [{ isExternal: false, pageName: 'nowhere' }] })]))

    await expect(generateUserReadablePageTree(editor, await getUserPageEntry(editor, 'values'))).rejects.toThrow()
    expect(memory.has(treePath('values'))).toBe(false)
  })

  it('TRE-3: a storage resource becomes its public URL, or an empty string when that fails', async () => {
    const data = await build({
      sr: [{ bucket: 'genoacms', name: 'a.png' }, { bucket: 'genoacms', name: 'unreachable' }, { bucket: 'other', name: 'b.png' }]
    })

    expect(data.files).toEqual(['https://storage.test/genoacms/a.png', '', 'https://storage.test/other/b.png'])
  })

  it('TRE-3: a slot becomes its nodes, in order, as nodes of the tree', async () => {
    const data = await build({ c: ['second', 'first'] }, [node('first', leaf, { x: '1' }), node('second', leaf, { x: '2' })])

    expect(data.slot.map((child: Parsed) => child.data.text)).toEqual(['2', '1'])
    expect(data.slot[0]).toMatchObject({ component: 'Leaf', type: 'prebuilt', uid: leaf.uid, publicationId: publicationIdOf(leaf.uid) })
  })

  it('TRE-3: the data is keyed by attribute name', async () => {
    const data = await build({})

    expect(Object.keys(data).sort()).toEqual(['blurb', 'body', 'count', 'files', 'flag', 'links', 'rich', 'slot', 'title'])
  })
})
