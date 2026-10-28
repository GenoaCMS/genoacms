import { describe, it, expect, vi, beforeEach } from 'vitest'
import { memory } from '$lib/script/testing/memoryStorage'
import {
  attribute, header, node, pageEntry, storeComponent, storePublishedComponent, storePage, storeTreePinning,
  storedHeader, storedDefinition, storedPage, readFlatted,
  headerPath, headerHistoryPath, definitionPath, definitionHistoryPath, pointerPath, entryPath
} from '$lib/script/testing/components'
import { callTool, useTool } from '$lib/script/testing/mcp'
import { principal } from '$lib/script/testing/requests'

vi.setConfig({ testTimeout: 30_000 })

vi.mock('$lib/script/storage/providers.server', async () => (await import('$lib/script/testing/memoryStorage')).memoryProviders)
vi.mock('$lib/script/signing/keyResolution.server', async () => (await import('$lib/script/testing/signingKeys')).testKeyResolution)
vi.mock('$lib/script/securityPolicy/policy.server', async (importOriginal) => ({
  ...await importOriginal<typeof import('$lib/script/securityPolicy/policy.server')>(),
  loadSecurityPolicy: async () => (await import('$lib/script/testing/signingKeys')).testSecurityPolicy
}))

const EVERY_PERMISSION = [
  'components:read', 'components:register', 'components:modify', 'components:code',
  'pages:read', 'pages:content_edit', 'pages:structure_edit', 'pages:publish', 'pages:delete'
] as const

const agent = principal([...EVERY_PERMISSION], 'agent:site-builder')

const card = header('0b6f5a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b', 'Card', [
  attribute.string('9d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6', 'heading', { minLength: 2 }),
  attribute.boolean('5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d', 'wide')
])
const source = header('1c7a6b3f-2d4e-4f60-9b0c-1d2e3f4a5b6c', 'Source', [attribute.string('2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b', 'heading')], 'dynamic')
const section = header('3e9c8d5b-4f60-4182-8d2e-3f4a5b6c7d8e', 'Section', [attribute.components('4f0d9e6c-5071-4293-9e3f-4a5b6c7d8e9f', 'children')])
const [HEADING, WIDE] = card.attributeOrder
const CHILDREN = section.attributeOrder[0]

const headerVersion = (uid: string): string => memory.versionOf(headerPath(uid)) as string
const sourceVersion = (uid: string): string => memory.versionOf(definitionPath(uid)) as string
const pageVersion = (name: string): string => memory.versionOf(entryPath(name)) as string
const historyLength = (path: string): number => readFlatted(path)?.history?.length ?? 0

beforeEach(() => {
  memory.clear()
  storePublishedComponent(card)
  storeComponent(source, 'return heading')
  storePublishedComponent(section)
  storePage(pageEntry('home', 'root', [node('root', section, { [CHILDREN]: ['c1'] }), node('c1', card, { [HEADING]: 'hello' })]))
})

describe('component tools', () => {
  it.fails('TOL-2: components are listed with their publication, and one is read with its version', async () => {
    const listed = await useTool(agent, 'list_components', {})
    expect(listed).toEqual(expect.arrayContaining([
      { uid: card.uid, name: 'Card', type: 'prebuilt', publication: { publicationId: `publication-of-${card.uid}`, publishedAt: 1_000 } },
      { uid: source.uid, name: 'Source', type: 'dynamic', publication: null }
    ]))
    expect(listed).toHaveLength(3)

    const read = await useTool(agent, 'get_component', { uid: card.uid })
    expect(read).toMatchObject({ uid: card.uid, name: 'Card', type: 'prebuilt', publication: { publicationId: `publication-of-${card.uid}` }, version: headerVersion(card.uid) })
    expect(read.attributes).toEqual([
      expect.objectContaining({ uid: HEADING, type: 'string', schema: card.attributes[HEADING].schema }),
      expect.objectContaining({ uid: WIDE, type: 'boolean', schema: card.attributes[WIDE].schema })
    ])

    const absent = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
    expect(await callTool(agent, 'get_component', { uid: absent }))
      .toMatchObject({ isError: true, text: `components/no-such-component: ${absent} does not exist.` })
  })

  it.fails('TOL-3, TOL-17: creating needs components:register', async () => {
    const before = memory.snapshot()
    const denied = await callTool(principal(['components:read', 'components:modify', 'components:code']), 'create_component', { name: 'Hero', type: 'prebuilt' })
    expect(denied.isError).toBe(true)
    expect(denied.text.startsWith('permission-denied:')).toBe(true)
    expect(memory.snapshot()).toEqual(before)

    const prebuilt = await useTool(agent, 'create_component', { name: 'Hero', type: 'prebuilt' })
    expect(storedHeader(prebuilt.uid)).toEqual({ uid: prebuilt.uid, type: 'prebuilt', name: 'Hero', attributes: {}, attributeOrder: [] })
    expect(prebuilt.version).toBe(headerVersion(prebuilt.uid))

    const dynamic = await useTool(agent, 'create_component', { name: 'Script', type: 'dynamic' })
    expect(storedHeader(dynamic.uid)).toMatchObject({ type: 'dynamic', name: 'Script' })
    expect(storedDefinition(dynamic.uid)).toMatchObject({ uid: dynamic.uid, language: 'typescript', body: '' })
  })

  it.fails('TOL-4: attributes are a list; uids are kept, new ones generated, unknown ones refused', async () => {
    const count = { type: 'number', schema: { type: 'number', title: 'count', description: '', required: false, maximum: 5 } }
    const saved = await useTool(agent, 'update_component', {
      uid: card.uid,
      version: headerVersion(card.uid),
      name: 'Card v2',
      attributes: [count, { uid: HEADING, type: 'string', schema: card.attributes[HEADING].schema }]
    })

    const stored = storedHeader(card.uid)
    expect(saved.version).toBe(headerVersion(card.uid))
    expect(stored.name).toBe('Card v2')
    expect(stored.type).toBe('prebuilt')
    expect(stored.attributeOrder).toHaveLength(2)
    const [generated, kept] = stored.attributeOrder
    expect(kept).toBe(HEADING)
    expect(generated).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(Object.keys(stored.attributes).sort()).toEqual([generated, HEADING].sort())
    expect(stored.attributes[generated]).toEqual({ uid: generated, name: 'count', type: 'number', schema: count.schema })
    expect(stored.attributes[HEADING]).toEqual({ ...card.attributes[HEADING], name: 'heading' })

    const unknown = '7b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'
    const before = memory.snapshot()
    expect(await callTool(agent, 'update_component', {
      uid: card.uid, version: headerVersion(card.uid), name: 'Card', attributes: [{ uid: unknown, ...count }]
    })).toMatchObject({ isError: true, text: `components/unknown-attribute: ${unknown}` })
    expect(await callTool(agent, 'update_component', {
      uid: card.uid,
      version: headerVersion(card.uid),
      name: 'Card',
      attributes: [{ uid: HEADING, ...count }, { uid: HEADING, type: 'string', schema: card.attributes[HEADING].schema }]
    })).toMatchObject({ isError: true, text: `components/unknown-attribute: ${HEADING}` })
    expect(memory.snapshot()).toEqual(before)
  })

  it.fails('TOL-5: the source is read and saved with its signature, prebuilt refused', async () => {
    const read = await useTool(agent, 'get_component_source', { uid: source.uid })
    expect(read).toMatchObject({ language: 'typescript', body: 'return heading', version: sourceVersion(source.uid) })
    expect(typeof read.signature.text).toBe('string')
    expect(read.signature.text).toContain('heading')
    expect(Array.isArray(read.signature.diagnostics)).toBe(true)

    const saved = await useTool(agent, 'save_component_source', { uid: source.uid, version: read.version, body: 'return heading + "!"' })
    expect(saved.version).toBe(sourceVersion(source.uid))
    expect(saved.version).not.toBe(read.version)
    expect(saved.signature).toEqual(read.signature)
    expect(storedDefinition(source.uid)).toMatchObject({ body: 'return heading + "!"', publishedBody: '', publishedSignature: '' })

    const refusal = `components/no-such-component: ${card.uid} is a prebuilt component.`
    const readPrebuilt = await callTool(agent, 'get_component_source', { uid: card.uid })
    expect(readPrebuilt.isError).toBe(true)
    expect(readPrebuilt.text.startsWith(refusal), readPrebuilt.text).toBe(true)
    const savePrebuilt = await callTool(agent, 'save_component_source', { uid: card.uid, version: headerVersion(card.uid), body: 'return 1' })
    expect(savePrebuilt.isError).toBe(true)
    expect(savePrebuilt.text.startsWith(refusal), savePrebuilt.text).toBe(true)
  })

  it.fails('TOL-6: publishing names the agent as publisher and returns warnings', async () => {
    const published = await useTool(agent, 'publish_component', { uid: source.uid, note: 'by an agent' })

    expect(published).toEqual({ publicationId: expect.any(String), publishedAt: expect.any(Number), warnings: expect.any(Array) })
    expect(readFlatted(pointerPath(source.uid))).toMatchObject({ publicationId: published.publicationId, publisherId: 'agent:site-builder', note: 'by an agent' })
    const publication = memory.json(`.genoacms/components/public/${source.uid}/${published.publicationId}.json`)
    expect(publication.payload).toMatchObject({ publisherId: 'agent:site-builder', type: 'dynamic' })

    const again = await callTool(agent, 'publish_component', { uid: source.uid, note: 'nothing new' })
    expect(again).toMatchObject({ isError: true, text: "Nothing has changed since the last publication: neither the component's description nor, where it has one, its code." })
  })

  it.fails('TOL-7: a component a published page pins is not deleted', async () => {
    storeTreePinning('home', card.uid)

    const refused = await callTool(agent, 'delete_component', { uid: card.uid })
    expect(refused.isError).toBe(true)
    expect(refused.text.startsWith('components/in-use:')).toBe(true)
    expect(refused.text).toContain('home')
    expect(memory.has(headerPath(card.uid))).toBe(true)

    await useTool(agent, 'delete_component', { uid: source.uid })
    expect(memory.has(headerPath(source.uid))).toBe(false)
    expect(memory.has(definitionPath(source.uid))).toBe(false)
  })

  it.fails('TOL-16: each changing call records exactly one step', async () => {
    await useTool(agent, 'update_component', {
      uid: card.uid,
      version: headerVersion(card.uid),
      name: 'Renamed',
      attributes: card.attributeOrder.map((uid: string) => ({ uid, type: card.attributes[uid].type, schema: card.attributes[uid].schema }))
    })
    expect(historyLength(headerHistoryPath(card.uid))).toBe(1)

    await useTool(agent, 'save_component_source', { uid: source.uid, version: sourceVersion(source.uid), body: 'return heading + 1' })
    expect(historyLength(definitionHistoryPath(source.uid))).toBe(1)

    const pageSteps = (): number => storedPage('home').history.length
    const added = await useTool(agent, 'add_node', { page: 'home', version: pageVersion('home'), parent: 'root', slot: CHILDREN, component: card.uid })
    expect(pageSteps()).toBe(1)
    await useTool(agent, 'set_values', { page: 'home', version: pageVersion('home'), node: 'c1', values: { [HEADING]: 'changed' } })
    expect(pageSteps()).toBe(2)
    await useTool(agent, 'move_node', { page: 'home', version: pageVersion('home'), node: added.node, parent: 'root', slot: CHILDREN, position: 0 })
    expect(pageSteps()).toBe(3)
    await useTool(agent, 'remove_node', { page: 'home', version: pageVersion('home'), node: added.node })
    expect(pageSteps()).toBe(4)
  })

  it.fails('TOL-17: every tool demands its permissions', async () => {
    const ADD = { page: 'home', parent: 'root', slot: CHILDREN, component: card.uid }
    const calls: Array<[string, readonly string[], () => Record<string, unknown>]> = [
      ['list_components', ['components:read'], () => ({})],
      ['get_component', ['components:read'], () => ({ uid: card.uid })],
      ['create_component', ['components:register'], () => ({ name: 'Hero', type: 'prebuilt' })],
      ['delete_component', ['components:register'], () => ({ uid: card.uid })],
      ['update_component', ['components:modify'], () => ({ uid: card.uid, version: headerVersion(card.uid), name: 'Renamed', attributes: [] })],
      ['get_component_source', ['components:code'], () => ({ uid: source.uid })],
      ['save_component_source', ['components:code'], () => ({ uid: source.uid, version: sourceVersion(source.uid), body: 'return 1' })],
      ['publish_component', ['components:modify'], () => ({ uid: card.uid, note: '' })],
      ['publish_component', ['components:modify', 'components:code'], () => ({ uid: source.uid, note: '' })],
      ['list_pages', ['pages:read'], () => ({})],
      ['get_page', ['pages:read'], () => ({ name: 'home' })],
      ['create_page', ['pages:read', 'pages:structure_edit'], () => ({ name: 'about', component: card.uid })],
      ['add_node', ['pages:read', 'pages:structure_edit'], () => ({ ...ADD, version: pageVersion('home') })],
      ['move_node', ['pages:read', 'pages:structure_edit'], () => ({ page: 'home', version: pageVersion('home'), node: 'c1', parent: 'root', slot: CHILDREN, position: 0 })],
      ['remove_node', ['pages:read', 'pages:structure_edit'], () => ({ page: 'home', version: pageVersion('home'), node: 'c1' })],
      ['set_values', ['pages:read', 'pages:content_edit'], () => ({ page: 'home', version: pageVersion('home'), node: 'c1', values: { [HEADING]: 'changed' } })],
      ['set_preview_url', ['pages:read', 'pages:content_edit'], () => ({ page: 'home', version: pageVersion('home'), url: 'https://example.com/home' })],
      ['build_page', ['pages:read', 'pages:content_edit', 'pages:publish'], () => ({ page: 'home' })],
      ['delete_page', ['pages:delete'], () => ({ page: 'home' })]
    ]

    for (const [tool, required, args] of calls) {
      for (const missing of required) {
        const lacking = principal(EVERY_PERMISSION.filter(permission => permission !== missing), 'agent:site-builder')
        const before = memory.snapshot()
        const outcome = await callTool(lacking, tool, args())
        expect(outcome.isError, `${tool} without ${missing}`).toBe(true)
        expect(outcome.text.startsWith('permission-denied:'), `${tool} without ${missing}: ${outcome.text}`).toBe(true)
        expect(memory.snapshot(), `${tool} without ${missing}`).toEqual(before)
      }
    }
  })
})
