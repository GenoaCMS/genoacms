import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PermissionDeniedError } from '$lib/script/authorization/enforce'
import { memory } from '$lib/script/testing/memoryStorage'
import {
  attribute, header, node, pageEntry, storeComponent, storePublishedComponent, storePage, storedPage, entryPath
} from '$lib/script/testing/components'
import { principal, runAction } from '$lib/script/testing/requests'

vi.mock('$lib/script/storage/providers.server', async () => (await import('$lib/script/testing/memoryStorage')).memoryProviders)
vi.mock('$lib/script/signing/keyResolution.server', async () => (await import('$lib/script/testing/signingKeys')).testKeyResolution)

const { actions: pagesActions } = await import('./+page.server')
const { actions: nodeActions } = await import('./[pageName]/[nodeUid]/+page.server')

const structureEditor = principal(['components:read', 'pages:read', 'pages:structure_edit', 'pages:content_edit'])
const contentEditor = principal(['components:read', 'pages:read', 'pages:content_edit'])

const card = header('0b6f5a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b', 'Card', [
  attribute.string('9d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6', 'heading', { default: 'Hello' }),
  attribute.number('5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d', 'count')
])
const banner = header('2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d', 'Banner', [])
const draft = header('8c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f', 'Draft', [])
const section = header('3e9c8d5b-4f60-4182-8d2e-3f4a5b6c7d8e', 'Section', [attribute.components('4f0d9e6c-5071-4293-9e3f-4a5b6c7d8e9f', 'children', ['Card'])])
const [HEADING, COUNT] = card.attributeOrder
const CHILDREN = section.attributeOrder[0]

const pageVersion = (name: string): string => memory.versionOf(entryPath(name)) as string

const createPage = async (fields: Record<string, string>) =>
  await runAction(pagesActions, 'createPage', fields, { auth: structureEditor, path: '/components/pages' })
const onNode = async (action: string, nodeUid: string, fields: Record<string, string>, auth = structureEditor) =>
  await runAction(nodeActions, action, fields, { auth, params: { pageName: 'home', nodeUid }, path: `/components/pages/home/${nodeUid}` })

beforeEach(() => {
  memory.clear()
  storePublishedComponent(card)
  storePublishedComponent(banner)
  storePublishedComponent(section)
  storeComponent(draft)
  storePage(pageEntry('home', 'root', [
    node('root', section, { [CHILDREN]: ['c1', 'c2'] }),
    node('c1', card, { [HEADING]: 'first' }),
    node('c2', card, { [HEADING]: 'second' })
  ]))
})

describe('the page form actions', () => {
  it.fails('PGE-2, PGE-11: a page is created only under a valid, free name, of a published component', async () => {
    const before = memory.snapshot()
    expect(await createPage({ componentUID: card.uid })).toEqual({ status: 400, data: { reason: 'no-page-name' } })
    for (const name of ['a/b', '../../components/headers/x.json', '..', 'a\u0001']) {
      expect(await createPage({ name, componentUID: card.uid }), name).toEqual({ status: 400, data: { reason: 'pages/invalid-name' } })
    }
    expect(await createPage({ name: 'home', componentUID: card.uid })).toEqual({ status: 409, data: { reason: 'pages/exists' } })
    expect(await createPage({ name: 'about', componentUID: draft.uid })).toEqual({ status: 400, data: { reason: 'pages/unpublished-component' } })
    expect(await createPage({ name: 'about', componentUID: '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' })).toEqual({ status: 400, data: { reason: 'pages/unpublished-component' } })
    expect(memory.snapshot()).toEqual(before)

    expect(await createPage({ name: 'about', componentUID: card.uid })).toEqual({ status: 307, location: 'pages/about' })
    const entry = storedPage('about')
    expect(entry).toMatchObject({ name: 'about', previewURL: '' })
    expect(Object.keys(entry.contents.nodes)).toEqual([entry.contents.rootNodeUid])
    expect(entry.contents.nodes[entry.contents.rootNodeUid]).toMatchObject({
      entryReference: card.uid,
      data: { [HEADING]: { value: 'Hello' }, [COUNT]: { value: 0 } }
    })
  })

  it.fails('PGE-5: a child is of the component named, from storage, never the client\'s header', async () => {
    const forged = { ...header(card.uid, 'Forged', [attribute.string('forged-attribute', 'forged')]), uid: banner.uid }
    const added = await onNode('addChildNode', 'root', {
      componentUID: card.uid,
      attributeUID: CHILDREN,
      version: pageVersion('home'),
      schema: JSON.stringify(forged)
    })
    expect(added.status).toBeLessThan(400)
    const entry = storedPage('home')
    const slot = entry.contents.nodes.root.data[CHILDREN].value
    expect(slot).toHaveLength(3)
    expect(slot.slice(0, 2)).toEqual(['c1', 'c2'])
    const child = entry.contents.nodes[slot[2]]
    expect(child.entryReference).toBe(card.uid)
    expect(Object.keys(child.data).sort()).toEqual([COUNT, HEADING].sort())
    expect(entry.history).toHaveLength(1)

    const version = pageVersion('home')
    const before = memory.snapshot()
    expect(await onNode('addChildNode', 'root', { attributeUID: CHILDREN, version })).toEqual({ status: 400, data: { reason: 'no-component' } })
    expect(await onNode('addChildNode', 'root', { componentUID: card.uid, version })).toEqual({ status: 400, data: { reason: 'no-target-attribute' } })
    expect(await onNode('addChildNode', 'root', { componentUID: card.uid, attributeUID: CHILDREN })).toEqual({ status: 400, data: { reason: 'no-version' } })

    const unpublished = await onNode('addChildNode', 'root', { componentUID: draft.uid, attributeUID: CHILDREN, version })
    expect(unpublished.status).toBe(400)
    expect(unpublished.data.reason.startsWith('pages/unpublished-component')).toBe(true)
    const refused = await onNode('addChildNode', 'root', { componentUID: banner.uid, attributeUID: CHILDREN, version })
    expect(refused.status).toBe(400)
    expect(refused.data.reason.startsWith('pages/not-accepted')).toBe(true)
    const missing = await onNode('addChildNode', 'missing', { componentUID: card.uid, attributeUID: CHILDREN, version })
    expect(missing.status).toBe(404)
    expect(missing.data.reason.startsWith('pages/no-such-node')).toBe(true)
    expect(memory.snapshot()).toEqual(before)
  })

  it.fails('PGE-4: a content editor cannot reorder or remove children', async () => {
    const before = memory.snapshot()
    const reordered = node('root', section, { [CHILDREN]: ['c2', 'c1'] })
    const reorder = await onNode('update', 'root', { componentNode: JSON.stringify(reordered), version: pageVersion('home') }, contentEditor)
    expect(reorder.thrown).toBeInstanceOf(PermissionDeniedError)
    const removed = node('root', section, { [CHILDREN]: ['c1'] })
    const remove = await onNode('update', 'root', { componentNode: JSON.stringify(removed), version: pageVersion('home') }, contentEditor)
    expect(remove.thrown).toBeInstanceOf(PermissionDeniedError)
    expect(memory.snapshot()).toEqual(before)

    const changed = node('c1', card, { [HEADING]: 'edited' })
    const content = await onNode('update', 'c1', { componentNode: JSON.stringify(changed), version: pageVersion('home') }, contentEditor)
    expect(content.status).toBeLessThan(400)
    expect(storedPage('home').contents.nodes.c1.data[HEADING].value).toBe('edited')
  })
})
