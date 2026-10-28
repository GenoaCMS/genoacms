import { describe, it, expect, vi, beforeEach } from 'vitest'
import { memory } from '$lib/script/testing/memoryStorage'
import {
  attribute, header, node, pageEntry, storeComponent, storePublishedComponent, storePage, storedPage,
  entryPath, treePath
} from '$lib/script/testing/components'
import { callTool, useTool } from '$lib/script/testing/mcp'
import { principal } from '$lib/script/testing/requests'

vi.mock('$lib/script/storage/providers.server', async () => (await import('$lib/script/testing/memoryStorage')).memoryProviders)
vi.mock('$lib/script/signing/keyResolution.server', async () => (await import('$lib/script/testing/signingKeys')).testKeyResolution)
vi.mock('$lib/script/securityPolicy/policy.server', async (importOriginal) => ({
  ...await importOriginal<typeof import('$lib/script/securityPolicy/policy.server')>(),
  loadSecurityPolicy: async () => (await import('$lib/script/testing/signingKeys')).testSecurityPolicy
}))

const agent = principal(['components:read', 'pages:read', 'pages:content_edit', 'pages:structure_edit', 'pages:publish', 'pages:delete'], 'agent:site-builder')

const card = header('0b6f5a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b', 'Card', [
  attribute.boolean('5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d', 'wide'),
  attribute.string('9d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6', 'heading')
])
const draft = header('8c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f', 'Draft', [])
const section = header('3e9c8d5b-4f60-4182-8d2e-3f4a5b6c7d8e', 'Section', [attribute.components('4f0d9e6c-5071-4293-9e3f-4a5b6c7d8e9f', 'children')])
const [WIDE, HEADING] = card.attributeOrder
const CHILDREN = section.attributeOrder[0]

const pageVersion = (name: string): string => memory.versionOf(entryPath(name)) as string

beforeEach(() => {
  memory.clear()
  storePublishedComponent(card)
  storePublishedComponent(section)
  storeComponent(draft)
  storePage(pageEntry('home', 'root', [
    node('root', section, { [CHILDREN]: ['c1'] }),
    node('c1', card, { [HEADING]: 'hello', [WIDE]: true }),
    node('orphan', card)
  ]))
})

describe('page tools', () => {
  it.fails('TOL-8: a page is read with its reachable nodes, values in attribute order, and its version', async () => {
    const listed = await useTool(agent, 'list_pages', {})
    expect(listed).toEqual([{ name: 'home', lastModified: expect.anything(), built: false }])

    const page = await useTool(agent, 'get_page', { name: 'home' })
    expect(page).toMatchObject({ name: 'home', previewURL: '', root: 'root', version: pageVersion('home') })
    expect(page.nodes.map((item: { uid: string }) => item.uid).sort()).toEqual(['c1', 'root'])
    const c1 = page.nodes.find((item: { uid: string }) => item.uid === 'c1')
    expect(c1).toEqual({
      uid: 'c1',
      component: { uid: card.uid, name: 'Card' },
      values: [
        { uid: WIDE, name: 'wide', type: 'boolean', value: true },
        { uid: HEADING, name: 'heading', type: 'string', value: 'hello' }
      ]
    })
    expect(page.nodes.find((item: { uid: string }) => item.uid === 'root').values)
      .toEqual([{ uid: CHILDREN, name: 'children', type: 'components', value: ['c1'] }])

    expect(await callTool(agent, 'get_page', { name: 'absent' })).toMatchObject({ isError: true, text: 'pages/no-such-page: absent' })
  })

  it.fails('TOL-9: create_page refuses a bad name, a taken name and an unpublished component', async () => {
    for (const name of ['a/b', 'a\\b', '.', '..', 'x'.repeat(201)]) {
      expect(await callTool(agent, 'create_page', { name, component: card.uid }), name)
        .toMatchObject({ isError: true, text: `pages/invalid-name: ${name}` })
    }
    const before = memory.snapshot()
    expect(await callTool(agent, 'create_page', { name: 'home', component: card.uid })).toMatchObject({ isError: true, text: 'pages/exists: home' })
    expect(await callTool(agent, 'create_page', { name: 'about', component: draft.uid }))
      .toMatchObject({ isError: true, text: `pages/unpublished-component: ${draft.uid}` })
    expect(memory.snapshot()).toEqual(before)

    const created = await useTool(agent, 'create_page', { name: 'about', component: card.uid })
    expect(created.version).toBe(pageVersion('about'))
    const entry = storedPage('about')
    expect(entry).toMatchObject({ name: 'about', previewURL: '' })
    expect(entry.contents.nodes[entry.contents.rootNodeUid]).toMatchObject({
      entryReference: card.uid,
      data: { [WIDE]: { value: false }, [HEADING]: { value: '' } }
    })
  })

  it.fails('TOL-14, TOL-15: the preview URL is set; a page is built and deleted', async () => {
    const set = await useTool(agent, 'set_preview_url', { page: 'home', version: pageVersion('home'), url: 'https://example.com/home' })
    expect(set.version).toBe(pageVersion('home'))
    expect(storedPage('home').previewURL).toBe('https://example.com/home')

    await useTool(agent, 'build_page', { page: 'home' })
    const tree = memory.json(treePath('home'))
    expect(tree).toMatchObject({ type: 'genoacms.pageTree.v1', payload: { component: 'Section', uid: section.uid, publicationId: `publication-of-${section.uid}` } })
    expect(tree.payload.data.children).toEqual([expect.objectContaining({ component: 'Card', publicationId: `publication-of-${card.uid}`, data: { wide: true, heading: 'hello' } })])
    expect((await useTool(agent, 'list_pages', {}))[0].built).toBe(true)

    await useTool(agent, 'delete_page', { page: 'home' })
    expect(memory.has(entryPath('home'))).toBe(false)
    expect(memory.has(treePath('home'))).toBe(false)
  })
})
