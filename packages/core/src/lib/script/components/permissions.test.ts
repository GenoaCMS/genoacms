import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PermissionDeniedError } from '$lib/script/authorization/enforce'
import type { Permission } from '$lib/script/authorization/permissions'
import { memory } from '$lib/script/testing/memoryStorage'
import {
  attribute, header, node, pageEntry, storeComponent, storePublishedComponent, storePage, headerPath, entryPath
} from '$lib/script/testing/components'
import { principal, runAction, type Parsed } from '$lib/script/testing/requests'

const request = vi.hoisted(() => ({ locals: {} as Record<string, unknown> }))

vi.setConfig({ testTimeout: 30_000 })

vi.mock('$app/server', () => ({
  command: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'command' } }),
  form: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'form' } }),
  query: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'query' } }),
  getRequestEvent: () => request
}))
vi.mock('$lib/script/storage/providers.server', async () => (await import('$lib/script/testing/memoryStorage')).memoryProviders)
vi.mock('$lib/script/signing/keyResolution.server', async () => (await import('$lib/script/testing/signingKeys')).testKeyResolution)
vi.mock('$lib/script/securityPolicy/policy.server', async (importOriginal) => ({
  ...await importOriginal<typeof import('$lib/script/securityPolicy/policy.server')>(),
  loadSecurityPolicy: async () => (await import('$lib/script/testing/signingKeys')).testSecurityPolicy
}))

const registrarList = await import('../../../routes/(admin)/components/registrar/+page.server')
const registrarOne = await import('../../../routes/(admin)/components/registrar/[componentId]/+page.server')
const { createComponent } = await import('../../../routes/(admin)/components/registrar/create.remote')
const { updateComponent } = await import('../../../routes/(admin)/components/registrar/[componentId]/update.remote')
const pagesList = await import('../../../routes/(admin)/components/pages/+page.server')
const pageLayout = await import('../../../routes/(admin)/components/pages/[pageName]/+layout.server')
const nodeRoute = await import('../../../routes/(admin)/components/pages/[pageName]/[nodeUid]/+page.server')
const editor = await import('./editor/user.server')
const headers = await import('./componentHeader/user.server')
const publication = await import('./publication/user.server')
const pageService = await import('./page/user.server')

const COMPONENT_PERMISSIONS: Permission[] = ['components:read', 'components:register', 'components:modify', 'components:code']
const PAGE_PERMISSIONS: Permission[] = ['pages:read', 'pages:content_edit', 'pages:structure_edit', 'pages:publish', 'pages:delete']

const card = header('3c1d7c52-6f4e-4f47-9d0e-1a2b3c4d5e6f', 'Card', [attribute.string('heading', 'heading')])
const hero = header('7d2e8f63-7a5f-4a58-8e1f-2b3c4d5e6f70', 'Hero', [attribute.string('heading', 'heading')], 'dynamic')
const section = header('3e9c8d5b-4f60-4182-8d2e-3f4a5b6c7d8e', 'Section', [attribute.components('children', 'children')])

type Operation = (auth: ReturnType<typeof principal>) => Promise<unknown>

const denied = async (run: () => Promise<unknown>): Promise<boolean> => {
  try {
    await run()
    return false
  } catch (error) {
    return error instanceof PermissionDeniedError
  }
}

async function outcomeOf (run: () => Promise<unknown>): Promise<Parsed> {
  try {
    return { returned: await run() }
  } catch (error) {
    return { thrown: error }
  }
}

beforeEach(() => {
  memory.clear()
  storeComponent(card)
  storeComponent(hero, 'return 1')
  request.locals = {}
})

describe('component permissions', () => {
  const version = (path: string) => memory.versionOf(path) as string
  const asRequest = (auth: ReturnType<typeof principal>) => { request.locals = { auth } }

  const operations: Array<[string, Permission[], Operation]> = [
    ['listing the catalog', ['components:read'], async auth => await registrarList.load({ locals: { auth } } as never)],
    ['reading a header with its history depth and publication status', ['components:read'],
      async auth => await registrarOne.load({ params: { componentId: card.uid }, locals: { auth } } as never)],
    ['listing the dynamic components', ['components:read'], async auth => await editor.listUserComponents(auth)],
    ['listing the composable components', ['components:read'], async auth => await publication.listUserComposableComponents(auth)],
    ['reading a publication\'s status', ['components:read'], async auth => await publication.getUserPublishedComponent(auth, card.uid)],
    ['registering', ['components:register'], async auth => { asRequest(auth); return await (createComponent as never as (a: unknown) => Promise<unknown>)({ name: 'New', type: 'prebuilt' }) }],
    ['deleting', ['components:register'], async auth =>
      await runAction(registrarOne.actions, 'delete', {}, { auth, params: { componentId: card.uid } }).then(outcome => { if (outcome.thrown) throw outcome.thrown })],
    ['listing the pages that pin a component', ['components:register'], async auth => await headers.listUserPagesPinningComponent(auth, card.uid)],
    ['saving a header', ['components:modify'], async auth => {
      asRequest(auth)
      const saved = await (updateComponent as never as (a: unknown) => Promise<Parsed>)({ header: { ...card, name: 'Renamed' }, version: version(headerPath(card.uid)) })
      if (saved.status !== 'success') throw new Error(saved.text)
    }],
    ['stepping a header\'s history', ['components:modify'], async auth => {
      const outcome = await runAction(registrarOne.actions, 'undo', { version: version(headerPath(card.uid)) }, { auth, params: { componentId: card.uid } })
      if (outcome.thrown) throw outcome.thrown
    }],
    ['reading a source definition', ['components:code'], async auth => await editor.getUserComponentDefinition(auth, hero.uid)],
    ['reading its signature preview', ['components:code'], async auth => await editor.getUserComponentSignature(auth, hero.uid)],
    ['reading its history depth', ['components:code'], async auth => await editor.getUserComponentDefinitionDepth(auth, hero.uid)],
    ['saving a body', ['components:code'], async auth =>
      await editor.saveUserComponentBody(auth, hero.uid, 'return 2', version(`.genoacms/components/dynamic/${hero.uid}/data.json`))],
    ['stepping a body\'s history', ['components:code'], async auth =>
      await editor.undoUserComponentBody(auth, hero.uid, version(`.genoacms/components/dynamic/${hero.uid}/data.json`))],
    ['publishing a prebuilt component', ['components:modify'], async auth => await publication.publishUserComponent(auth, { componentId: card.uid, note: '' })],
    ['publishing a dynamic component', ['components:modify', 'components:code'], async auth => await publication.publishUserComponent(auth, { componentId: hero.uid, note: '' })]
  ]

  it.each(operations)('CMP-11: %s needs exactly its permission, which no other component permission implies', async (_name, needed, run) => {
    for (const missing of needed) {
      const others = COMPONENT_PERMISSIONS.filter(permission => permission !== missing)
      const without = principal(others)
      expect(await denied(async () => await run(without)), `without ${missing}`).toBe(true)
    }
    expect(await denied(async () => await run(principal(needed))), `with ${needed.join(', ')}`).toBe(false)
  })

  it('CMP-11: the permission is checked before the stored kind is read, so a principal without it learns nothing about the component', async () => {
    const nobody = principal([])

    expect(await denied(async () => await headers.deleteUserComponentHeader(nobody, 'unknown'))).toBe(true)
    expect(await denied(async () => await publication.publishUserComponent(nobody, { componentId: 'unknown', note: '' }))).toBe(true)
    expect(await denied(async () => await publication.publishUserComponent(principal(['components:modify']), { componentId: hero.uid, note: '' }))).toBe(true)
  })
})

describe('page permissions', () => {
  const stored = (auth: ReturnType<typeof principal>, nodeUid = 'n1') => ({ auth, params: { pageName: 'home', nodeUid }, path: `/components/pages/home/${nodeUid}` })
  const page = () => memory.versionOf(entryPath('home')) as string
  const edited = (heading: string) => JSON.stringify(node('n1', card, { heading }))
  const reorder = () => JSON.stringify(node('root', section, { children: ['n2', 'n1'] }))

  beforeEach(() => {
    storePublishedComponent(card)
    storePublishedComponent(section)
    storePage(pageEntry('home', 'root', [
      node('root', section, { children: ['n1', 'n2'] }),
      node('n1', card, { heading: 'first' }),
      node('n2', card, { heading: 'second' })
    ]))
  })

  type PageOperation = (auth: ReturnType<typeof principal>) => Promise<Parsed>
  const operations: Array<[string, Permission[], PageOperation]> = [
    ['listing pages', ['pages:read'], async auth => await pagesList.load({ locals: { auth } } as never)],
    ['reading an entry', ['pages:read'], async auth => await pageService.getUserPageEntry(auth, 'home') as never],
    ['creating a page', ['pages:structure_edit'], async auth =>
      await runAction(pagesList.actions, 'createPage', { name: `created-${Math.random()}`, componentUID: card.uid }, { auth })],
    ['adding a child node', ['pages:read', 'pages:structure_edit'], async auth =>
      await runAction(nodeRoute.actions, 'addChildNode', { componentUID: card.uid, attributeUID: 'children', version: page() }, stored(auth, 'root'))],
    ['editing the values of a node', ['pages:read', 'pages:content_edit'], async auth =>
      await runAction(nodeRoute.actions, 'update', { componentNode: edited('x'), version: page() }, stored(auth))],
    ['editing the preview URL', ['pages:read', 'pages:content_edit'], async auth =>
      await runAction(nodeRoute.actions, 'changePreviewURL', { value: 'https://a.test/', version: page() }, stored(auth))],
    ['changing a slot of a node', ['pages:read', 'pages:structure_edit'], async auth =>
      await runAction(nodeRoute.actions, 'update', { componentNode: reorder(), version: page() }, stored(auth, 'root'))],
    ['undoing', ['pages:read', 'pages:content_edit', 'pages:structure_edit'], async auth =>
      await runAction(nodeRoute.actions, 'undo', { version: page() }, stored(auth))],
    ['redoing', ['pages:read', 'pages:content_edit', 'pages:structure_edit'], async auth =>
      await runAction(nodeRoute.actions, 'redo', { version: page() }, stored(auth))],
    ['building', ['pages:read', 'pages:content_edit', 'pages:publish'], async auth =>
      await runAction(nodeRoute.actions, 'updateAndGenerateTree', { componentNode: edited('built'), version: page() }, stored(auth))],
    ['deleting', ['pages:delete'], async auth => {
      const fields = { ids: JSON.stringify(['home']), names: JSON.stringify(['home']), confirmation: 'home' }
      return await runAction(pagesList.actions, 'deleteSelected', fields, { auth })
    }]
  ]

  const refused = async (run: () => Promise<Parsed>): Promise<boolean> => {
    const outcome = await outcomeOf(run)
    const answered = outcome.returned
    return outcome.thrown instanceof PermissionDeniedError || answered?.thrown instanceof PermissionDeniedError ||
      (answered?.status === 409 && String(answered.data?.reason).includes('permission-denied'))
  }

  it.each(operations)('PGE-10: %s needs its permissions, and holding all the others is not enough', async (_name, needed, run) => {
    for (const missing of needed) {
      const others = [...PAGE_PERMISSIONS, 'components:read' as Permission].filter(permission => permission !== missing)
      expect(await refused(async () => await run(principal(others))), `without ${missing}`).toBe(true)
    }
    storePublishedComponent(card)
    storePage(pageEntry('home', 'root', [
      node('root', section, { children: ['n1', 'n2'] }), node('n1', card, { heading: 'first' }), node('n2', card, { heading: 'second' })
    ]))
    const granted = await outcomeOf(async () => await run(principal(needed)))
    expect(granted.thrown, 'with exactly its permissions').toBeUndefined()
    expect(granted.returned?.thrown, 'with exactly its permissions').toBeUndefined()
  })

  it('PGE-10: opening the page screens also requires components:read', async () => {
    const withoutComponents = principal(['pages:read'])

    expect(await refused(async () => await pageLayout.load({
      params: { pageName: 'home' }, locals: { auth: withoutComponents }, parent: async () => ({ composableComponents: [] })
    } as never))).toBe(true)
    expect(await refused(async () => await pageLayout.load({
      params: { pageName: 'home' }, locals: { auth: principal(['pages:read', 'components:read']) }, parent: async () => ({ composableComponents: [] })
    } as never))).toBe(false)
  })
})
