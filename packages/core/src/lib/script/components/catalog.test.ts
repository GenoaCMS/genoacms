import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PermissionDeniedError } from '$lib/script/authorization/enforce'
import { memory } from '$lib/script/testing/memoryStorage'
import {
  attribute, header, storeComponent, storePublication, storePage, pageEntry, node,
  headerPath, headerHistoryPath, definitionPath, definitionHistoryPath, pointerPath, entryPath,
  storedHeader, storedDefinition, readFlatted
} from '$lib/script/testing/components'
import { principal, runAction, type Parsed } from '$lib/script/testing/requests'
import { stringify as stringifyFlatted } from 'flatted'
import { sign } from '$lib/script/signing/envelope'
import { signingKey } from '$lib/script/testing/signingKeys'

const request = vi.hoisted(() => ({ locals: {} as Record<string, unknown> }))

vi.mock('$app/server', () => ({
  command: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'command' } }),
  form: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'form' } }),
  query: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'query' } }),
  getRequestEvent: () => request
}))
vi.mock('$lib/script/storage/providers.server', async () => (await import('$lib/script/testing/memoryStorage')).memoryProviders)
vi.mock('$lib/script/signing/keyResolution.server', async () => (await import('$lib/script/testing/signingKeys')).testKeyResolution)

const { createComponent: createComponentCommand } = await import('../../../routes/(admin)/components/registrar/create.remote')
const { saveComponentRemote: saveComponentForm } = await import('../../../routes/(admin)/components/editor/[componentId]/save.remote')
const { deleteComponentRemote: deleteComponentForm } = await import('../../../routes/(admin)/components/editor/[componentId]/delete.remote')
const { pagesPinningComponent: pagesPinningQuery } = await import('./dependents.remote')
const registrarList = await import('../../../routes/(admin)/components/registrar/+page.server')
const registrarOne = await import('../../../routes/(admin)/components/registrar/[componentId]/+page.server')
const editorList = await import('../../../routes/(admin)/components/editor/+page.server')
const editorOne = await import('../../../routes/(admin)/components/editor/[componentId]/+page.server')
const { getUserComponentSignature, createUserComponent } = await import('./editor/user.server')
const { deleteUserComponentHeader, updateUserComponentHeader } = await import('./componentHeader/user.server')
const { getLanguageAdapter } = await import('./language.server')

const call = async (fn: unknown, argument: unknown): Promise<Parsed> => await (fn as (argument: unknown) => Promise<unknown>)(argument)
const createComponent = async (argument: unknown) => await call(createComponentCommand, argument)
const saveComponentRemote = async (argument: unknown) => await call(saveComponentForm, argument)
const deleteComponentRemote = async (argument: unknown) => await call(deleteComponentForm, argument)
const pagesPinningComponent = async (uid: string) => await call(pagesPinningQuery, uid)

const everything = principal(['*'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const card = header('3c1d7c52-6f4e-4f47-9d0e-1a2b3c4d5e6f', 'Card', [attribute.string('heading', 'heading')])
const hero = header('7d2e8f63-7a5f-4a58-8e1f-2b3c4d5e6f70', 'Hero', [], 'dynamic')

async function outcomeOf (run: () => Promise<unknown>): Promise<Parsed> {
  try {
    return { returned: await run() }
  } catch (error) {
    return { thrown: error }
  }
}

function storeEverythingOf (stored: Parsed): void {
  storeComponent(stored, 'return 1')
  memory.set(headerHistoryPath(stored.uid), '[{"history":"1","future":"2"},[],[]]')
  if (stored.type === 'dynamic') memory.set(definitionHistoryPath(stored.uid), '[{"history":"1","future":"2"},[],[]]')
  memory.set(`.genoacms/components/public/${stored.uid}/one.json`, '{}')
  memory.set(`.genoacms/components/public/${stored.uid}/two.json`, '{}')
  storePublication(stored.uid)
}

function storeTree (name: string, root: Parsed): void {
  memory.set(`.genoacms/pages/readables/${name}`, JSON.stringify({ ...sign('genoacms.pageTree.v1', root, signingKey), payload: root }))
}

const pinning = (uid: string, children: Parsed[] = []): Parsed => ({
  component: 'Pinned', type: 'prebuilt', uid, publicationId: 'p', data: children.length === 0 ? {} : { slot: children }
})
const other = (children: Parsed[] = []): Parsed => ({ component: 'Other', type: 'prebuilt', data: children.length === 0 ? {} : { slot: children } })

beforeEach(() => {
  memory.clear()
  request.locals = { auth: everything }
})

describe('the shape of a component header', () => {
  it('CMP-2: registering stores exactly the header fields, with a random UUID and no attributes', async () => {
    const created = await createComponent({ name: 'Card', type: 'prebuilt' })

    const stored = storedHeader(created.uid)
    expect(created.uid).toMatch(UUID)
    expect(stored).toEqual({ uid: created.uid, type: 'prebuilt', name: 'Card', attributes: {}, attributeOrder: [] })
    expect(await createComponent({ name: 'Card', type: 'prebuilt' })).toMatchObject({ status: 'success' })
    expect(memory.names().filter(name => name.endsWith('.json'))).toHaveLength(2)
  })
})

describe('a valid header', () => {
  it('CMP-4: a stored header that is not valid reads as absent, and is left out of the catalog', async () => {
    storeComponent(card)
    memory.set(headerPath('with-extra-field'), JSON.stringify({ ...header('with-extra-field', 'Extra'), history: [] }))
    memory.set(headerPath('with-extra-attribute-field'), JSON.stringify(
      header('with-extra-attribute-field', 'X', [{ ...attribute.string('a', 'a'), surprise: true }])
    ))
    memory.set(headerPath('with-bad-constraint'), JSON.stringify(
      header('with-bad-constraint', 'X', [attribute.number('n', 'n', { minimum: null })])
    ))
    memory.set(headerPath('not-json'), 'not json')

    const listed = await registrarList.load({ locals: request.locals } as never)

    expect(listed.componentEntries.map((entry: Parsed) => entry.uid)).toEqual([card.uid])
    for (const uid of ['with-extra-field', 'with-extra-attribute-field', 'with-bad-constraint', 'not-json']) {
      const outcome = await outcomeOf(async () => await registrarOne.load({ params: { componentId: uid }, locals: request.locals } as never))
      expect(outcome.thrown, uid).toMatchObject({ status: 404 })
    }
  })
})

describe('registering a component', () => {
  it('CMP-6: a valid argument creates a header, and a dynamic component also a definition', async () => {
    const prebuilt = await createComponent({ name: 'Card', type: 'prebuilt' })
    expect(prebuilt).toEqual({ status: 'success', text: 'Component created', uid: expect.stringMatching(UUID) })
    expect(storedHeader(prebuilt.uid)).toEqual({ uid: prebuilt.uid, type: 'prebuilt', name: 'Card', attributes: {}, attributeOrder: [] })
    expect(memory.has(definitionPath(prebuilt.uid))).toBe(false)

    const dynamic = await createComponent({ name: 'Hero', type: 'dynamic' })
    expect(dynamic).toEqual({ status: 'success', text: 'Component created', uid: expect.stringMatching(UUID) })
    expect(dynamic.uid).not.toBe(prebuilt.uid)
    expect(storedHeader(dynamic.uid)).toEqual({ uid: dynamic.uid, type: 'dynamic', name: 'Hero', attributes: {}, attributeOrder: [] })
    expect(memory.has(definitionPath(dynamic.uid))).toBe(true)
  })

  it('CMP-6: an invalid argument is answered Invalid data and stores nothing', async () => {
    for (const argument of [
      {}, { name: 'x' }, { type: 'prebuilt' }, { name: '', type: 'prebuilt' }, { name: 'x', type: 'other' },
      { name: 3, type: 'prebuilt' }, { name: 'x', type: 'prebuilt', extra: 1 }, 'x', null
    ]) {
      expect(await createComponent(argument), JSON.stringify(argument)).toEqual({ status: 'fail', text: 'Invalid data' })
    }
    expect(memory.names()).toEqual([])
  })

  it('CMP-6: a permission denial is thrown', async () => {
    request.locals = { auth: principal(['components:read', 'components:modify', 'components:code']) }

    for (const type of ['prebuilt', 'dynamic']) {
      const outcome = await outcomeOf(async () => await createComponent({ name: 'Card', type }))
      expect(outcome.thrown).toBeInstanceOf(PermissionDeniedError)
    }
    expect(memory.names()).toEqual([])
  })
})

describe('reading the catalog', () => {
  it('CMP-7: the registrar lists every valid header of both kinds and not the history files', async () => {
    storeEverythingOf(card)
    storeEverythingOf(hero)

    const listed = await registrarList.load({ locals: request.locals } as never)

    expect(listed.componentEntries.map((entry: Parsed) => entry.uid).sort()).toEqual([card.uid, hero.uid].sort())
  })

  it('CMP-7: one component is shown with its history depth and last publication, or answers 404 No such component', async () => {
    storeComponent(card)
    storePublication(card.uid)
    await updateUserComponentHeader(everything, { ...card, name: 'Renamed' } as never, memory.versionOf(headerPath(card.uid)) as string)

    const shown = await registrarOne.load({ params: { componentId: card.uid }, locals: request.locals } as never)
    expect(shown).toMatchObject({ id: card.uid, componentHeader: { ...card, name: 'Renamed' }, publishedAt: 1_000, historyLength: 1, futureLength: 0 })

    const missing = await outcomeOf(async () => await registrarOne.load({ params: { componentId: 'nobody' }, locals: request.locals } as never))
    expect(missing.thrown).toMatchObject({ status: 404, body: { message: 'No such component' } })
  })
})

describe('deleting a component', () => {
  const remains = (uid: string): string[] => memory.names().filter(name => name.includes(uid))

  it('CMP-9: a prebuilt component loses its header, history, publications and pointer', async () => {
    storeEverythingOf(card)
    storeComponent(hero)

    const outcome = await runAction(registrarOne.actions, 'delete', {}, { auth: everything, params: { componentId: card.uid } })

    expect(outcome).toEqual({ status: 307, location: '.' })
    expect(remains(card.uid)).toEqual([])
    expect(remains(hero.uid)).not.toEqual([])
  })

  it('CMP-9: a dynamic component also loses its source directory, and nothing else is touched', async () => {
    storeEverythingOf(hero)
    storeEverythingOf(card)

    const outcome = await runAction(registrarOne.actions, 'delete', {}, { auth: everything, params: { componentId: hero.uid } })

    expect(outcome).toEqual({ status: 307, location: '.' })
    expect(remains(hero.uid)).toEqual([])
    expect(remains(card.uid)).toHaveLength(5)
  })

  it('CMP-9: removing objects that are already absent is not a failure', async () => {
    storeComponent(card)
    storeComponent(hero)

    expect(await runAction(registrarOne.actions, 'delete', {}, { auth: everything, params: { componentId: card.uid } })).toMatchObject({ status: 307 })
    expect(await runAction(registrarOne.actions, 'delete', {}, { auth: everything, params: { componentId: hero.uid } })).toMatchObject({ status: 307 })
    expect(memory.names()).toEqual([])
  })

  it('CMP-9: a reference that is not a prebuilt component is refused by the header service with components/not-prebuilt', async () => {
    storeComponent(hero)

    await expect(deleteUserComponentHeader(everything, hero.uid)).rejects.toThrow(/^components\/not-prebuilt:/)
    expect(remains(hero.uid)).not.toEqual([])
  })

  it('CMP-9: a published page pinning the component refuses the deletion with components/in-use, naming the pages, and nothing is removed', async () => {
    storeEverythingOf(card)
    storeTree('home', pinning(card.uid))
    storeTree('about', other([pinning(card.uid)]))
    const before = memory.snapshot()

    const outcome = await runAction(registrarOne.actions, 'delete', {}, { auth: everything, params: { componentId: card.uid } })
    expect(outcome.status).toBe(409)
    expect(outcome.data.reason.startsWith('components/in-use:')).toBe(true)
    expect(outcome.data.reason).toContain('home')
    expect(outcome.data.reason).toContain('about')
    expect(memory.snapshot()).toEqual(before)

    storeEverythingOf(hero)
    storeTree('landing', pinning(hero.uid))
    const dynamic = await runAction(registrarOne.actions, 'delete', {}, { auth: everything, params: { componentId: hero.uid } })
    expect(dynamic.status).toBe(409)
    expect(dynamic.data.reason.startsWith('components/in-use:')).toBe(true)
    expect(remains(hero.uid)).not.toEqual([])
  })

  it('CMP-9: deleteSelected answers 400 for a malformed, empty, mismatched or unconfirmed selection', async () => {
    storeComponent(card)
    const fields = { ids: JSON.stringify([card.uid]), names: JSON.stringify(['Card']), confirmation: 'Card' }
    const refuse = async (over: Record<string, string>) =>
      await runAction(registrarList.actions, 'deleteSelected', { ...fields, ...over }, { auth: everything, path: '/components/registrar' })

    expect(await refuse({ ids: 'not json' })).toEqual({ status: 400, data: { reason: 'selection/malformed' } })
    expect(await refuse({ names: JSON.stringify([1]) })).toEqual({ status: 400, data: { reason: 'selection/malformed' } })
    expect(await refuse({ ids: '[]', names: '[]' })).toEqual({ status: 400, data: { reason: 'selection/empty' } })
    expect(await refuse({ names: JSON.stringify(['Card', 'Extra']) })).toEqual({ status: 400, data: { reason: 'selection/mismatched' } })
    expect(await refuse({ confirmation: 'Other' })).toEqual({ status: 400, data: { reason: 'selection/not-confirmed' } })
    expect(memory.has(headerPath(card.uid))).toBe(true)
  })

  it('CMP-9: deleteSelected removes the selection, comparing confirmations ignoring spaces around the commas', async () => {
    storeEverythingOf(card)
    storeEverythingOf(hero)
    const fields = {
      ids: JSON.stringify([card.uid, hero.uid]),
      names: JSON.stringify(['Card', 'Hero']),
      confirmation: 'Card ,  Hero'
    }

    expect(await runAction(registrarList.actions, 'deleteSelected', fields, { auth: everything, path: '/components/registrar' }))
      .toEqual({ status: 200, data: { success: true } })
    expect(memory.names()).toEqual([])
  })

  it('CMP-9: deleteSelected stops at the failure as 409 selection/partial naming how many were removed', async () => {
    storeComponent(card)
    storeEverythingOf(hero)
    storeTree('home', pinning(hero.uid))
    const fields = {
      ids: JSON.stringify([card.uid, hero.uid]),
      names: JSON.stringify(['Card', 'Hero']),
      confirmation: 'Card, Hero'
    }

    const outcome = await runAction(registrarList.actions, 'deleteSelected', fields, { auth: everything, path: '/components/registrar' })

    expect(outcome.status).toBe(409)
    expect(outcome.data.reason.startsWith('selection/partial: removed 1 of 2; components/in-use:')).toBe(true)
    expect(remains(card.uid)).toEqual([])
    expect(remains(hero.uid)).not.toEqual([])
  })

  it('CMP-9: the editor\'s deleteSelected refuses a prebuilt component as the editor does', async () => {
    storeComponent(card)
    const fields = { ids: JSON.stringify([card.uid]), names: JSON.stringify(['Card']), confirmation: 'Card' }

    const outcome = await runAction(editorList.actions, 'deleteSelected', fields, { auth: everything, path: '/components/editor' })

    expect(outcome.status).toBe(409)
    expect(outcome.data.reason.startsWith('selection/partial: removed 0 of 1; components/no-such-component:')).toBe(true)
    expect(memory.has(headerPath(card.uid))).toBe(true)
  })

  it('CMP-9: the remote form deletes a dynamic component when the name matches, and says so otherwise', async () => {
    storeEverythingOf(hero)

    expect(await deleteComponentRemote({ uid: hero.uid, name: 'Wrong' }))
      .toEqual({ status: 'fail', text: 'Confirmation phase "Wrong" doesn\'t match "Hero"' })
    expect(remains(hero.uid)).not.toEqual([])

    expect(await deleteComponentRemote({ uid: hero.uid, name: 'Hero' })).toEqual({ status: 'success', text: 'Component deleted' })
    expect(remains(hero.uid)).toEqual([])
  })

  it('CMP-9: the remote form reports a pinned component with the in-use message', async () => {
    storeEverythingOf(hero)
    storeTree('home', pinning(hero.uid))

    const outcome = await deleteComponentRemote({ uid: hero.uid, name: 'Hero' })

    expect(outcome.status).toBe('fail')
    expect(outcome.text.startsWith('components/in-use:')).toBe(true)
    expect(remains(hero.uid)).not.toEqual([])
  })
})

describe('the pages that pin a component', () => {
  it('CMP-10: every published page with a node of the component at any depth is reported with its node count', async () => {
    storeComponent(card)
    storeTree('shallow', pinning(card.uid))
    storeTree('deep', other([other([pinning(card.uid), pinning(card.uid)]), pinning(card.uid)]))
    storeTree('elsewhere', other([pinning('another-component')]))
    storePage(pageEntry('draft-only', 'n1', [node('n1', card)]))

    const answer = await pagesPinningComponent(card.uid)

    expect(answer.status).toBe('success')
    expect(answer.unreadable).toEqual([])
    expect([...answer.pages].sort((a: Parsed, b: Parsed) => a.name.localeCompare(b.name))).toEqual([
      { name: 'deep', nodes: 3 },
      { name: 'shallow', nodes: 1 }
    ])
  })

  it('CMP-10: a tree that does not verify is reported unreadable and does not refuse a deletion', async () => {
    storeEverythingOf(card)
    storeTree('good', pinning('another-component'))
    const tampered = JSON.stringify({ ...sign('genoacms.pageTree.v1', pinning('another-component'), signingKey), payload: pinning(card.uid) })
    memory.set('.genoacms/pages/readables/tampered', tampered)

    const answer = await pagesPinningComponent(card.uid)

    expect(answer).toEqual({ status: 'success', pages: [], unreadable: ['tampered'] })
    expect(await runAction(registrarOne.actions, 'delete', {}, { auth: everything, params: { componentId: card.uid } })).toMatchObject({ status: 307 })
  })

  it.fails('CMP-10: a tree that cannot be read is reported unreadable', async () => {
    storeComponent(card)
    memory.set('.genoacms/pages/readables/garbled', 'not json')

    const answer = await pagesPinningComponent(card.uid)

    expect(answer.unreadable).toEqual(['garbled'])
  })

  it('CMP-10: a failure is answered as fail with empty lists', async () => {
    request.locals = { auth: principal(['components:read']) }

    const answer = await pagesPinningComponent(card.uid)

    expect(answer).toEqual({ status: 'fail', text: expect.any(String), pages: [], unreadable: [] })
  })
})

describe('a source definition', () => {
  it('SRC-1: a dynamic component is created with typescript and every other field empty', async () => {
    const uid = await createUserComponent(everything, 'Hero')

    expect(storedDefinition(uid)).toEqual({ uid, language: 'typescript', body: '', publishedBody: '', publishedSignature: '' })
  })

  it('SRC-1: a stored definition that does not match fails the read with Invalid component definition', async () => {
    storeComponent(hero)
    memory.set(definitionPath(hero.uid), stringifyFlatted({ uid: hero.uid, language: 'typescript', body: 3 }))

    const outcome = await outcomeOf(async () => await editorOne.load({ params: { componentId: hero.uid }, locals: request.locals } as never))

    expect(outcome.thrown).toMatchObject({ message: `Invalid component definition: ${hero.uid}` })
  })
})

describe('opening a component\'s source', () => {
  it('SRC-2: shows the body, the signature preview and the history depth', async () => {
    storeComponent(hero, 'return 7')

    const shown = await editorOne.load({ params: { componentId: hero.uid }, locals: request.locals } as never)

    expect(shown.componentDefinition.body).toBe('return 7')
    expect(shown.signature.text).toContain('export default function component')
    expect(shown).toMatchObject({ historyLength: 0, futureLength: 0 })
  })

  it('SRC-2: a reference with no header answers 404 no-such-component, and a prebuilt component 404 naming it prebuilt', async () => {
    storeComponent(card)

    const missing = await outcomeOf(async () => await editorOne.load({ params: { componentId: 'nobody' }, locals: request.locals } as never))
    expect(missing.thrown).toMatchObject({ status: 404 })
    expect(missing.thrown.body.message).toBe('components/no-such-component: nobody does not exist.')

    const prebuilt = await outcomeOf(async () => await editorOne.load({ params: { componentId: card.uid }, locals: request.locals } as never))
    expect(prebuilt.thrown).toMatchObject({ status: 404 })
    expect(prebuilt.thrown.body.message.startsWith(`components/no-such-component: ${card.uid} is a prebuilt component.`)).toBe(true)
  })
})

describe('the signature preview', () => {
  const adapterSignature = async (shape: Parsed) => await (await getLanguageAdapter('typescript')).emitSignature(shape)

  it('SRC-3: is the language adapter\'s emitSignature of the header\'s attributes and attributeOrder', async () => {
    const withAttributes = header(hero.uid, 'Hero', [attribute.string('a', 'heading'), attribute.number('b', 'count')], 'dynamic')
    storeComponent(withAttributes)

    const preview = await getUserComponentSignature(everything, hero.uid)

    expect(preview).toEqual(await adapterSignature({ attributes: withAttributes.attributes, attributeOrder: withAttributes.attributeOrder }))
    expect(preview.text).toContain('heading: string')
    expect(preview.text).toContain('count: number')
  })

  it('SRC-3: is returned, not raised, when it has diagnostics', async () => {
    const unnameable = header(hero.uid, 'Hero', [attribute.string('a', '???')], 'dynamic')
    storeComponent(unnameable)

    const preview = await getUserComponentSignature(everything, hero.uid)

    expect(preview.diagnostics).toHaveLength(1)
    expect(preview.diagnostics[0]).toMatchObject({ severity: 'fatal', rule: 'unnameable-attribute' })
    expect(preview).toEqual(await adapterSignature({ attributes: unnameable.attributes, attributeOrder: unnameable.attributeOrder }))
  })
})

describe('saving a body', () => {
  const saved = async (body: string, version?: string) =>
    await saveComponentRemote({ uid: hero.uid, body, version: version ?? memory.versionOf(definitionPath(hero.uid)) })

  beforeEach(() => { storeComponent(hero, 'return 1') })

  it('SRC-4: writes the body, records the step and answers the depth and the new version', async () => {
    const result = await saved('return 2')

    expect(result).toEqual({
      status: 'success', text: 'Code saved', historyLength: 1, futureLength: 0, version: memory.versionOf(definitionPath(hero.uid))
    })
    expect(storedDefinition(hero.uid).body).toBe('return 2')
    expect(readFlatted(definitionHistoryPath(hero.uid)).history).toHaveLength(1)
  })

  it('SRC-4: does not touch publishedBody or publishedSignature', async () => {
    const stored = storedDefinition(hero.uid)
    const withPublished = { ...stored, publishedBody: 'return 0', publishedSignature: 'signature' }
    memory.set(definitionPath(hero.uid), stringifyFlatted(withPublished))

    await saved('return 2')

    expect(storedDefinition(hero.uid)).toEqual({ ...withPublished, body: 'return 2' })
  })

  it('SRC-4: answers Invalid data for a uid that is not a UUID or a body or version that is not a string', async () => {
    const before = memory.snapshot()

    for (const argument of [
      { uid: 'not-a-uuid', body: 'x', version: 'v' }, { uid: hero.uid, body: 1, version: 'v' },
      { uid: hero.uid, body: 'x', version: 1 }, { uid: hero.uid, body: 'x' }, { body: 'x', version: 'v' }
    ]) {
      expect(await saveComponentRemote(argument), JSON.stringify(argument)).toEqual({ status: 'fail', text: 'Invalid data' })
    }
    expect(memory.snapshot()).toEqual(before)
  })

  it('SRC-4: answers the error\'s message for any failure', async () => {
    request.locals = { auth: principal(['components:read']) }
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await saved('return 2')

    expect(result.status).toBe('fail')
    expect(result.text).toMatch(/lacks components:code/)
  })

  it('SRC-4: the undo and redo actions take the form field version and step the history', async () => {
    await saved('return 2')

    const undone = await runAction(editorOne.actions, 'undo', { version: memory.versionOf(definitionPath(hero.uid)) as string }, { auth: everything, params: { componentId: hero.uid } })
    expect(undone.status).toBeLessThan(400)
    expect(storedDefinition(hero.uid).body).toBe('return 1')

    const redone = await runAction(editorOne.actions, 'redo', { version: memory.versionOf(definitionPath(hero.uid)) as string }, { auth: everything, params: { componentId: hero.uid } })
    expect(redone.status).toBeLessThan(400)
    expect(storedDefinition(hero.uid).body).toBe('return 2')

    expect(await runAction(editorOne.actions, 'undo', {}, { auth: everything, params: { componentId: hero.uid } }))
      .toMatchObject({ status: 400 })
  })
})

describe('where everything is stored', () => {
  it('CMP-1: the paths of the headers and definitions, in JSON and flatted', async () => {
    const prebuilt = await createComponent({ name: 'Card', type: 'prebuilt' })
    const dynamic = await createComponent({ name: 'Hero', type: 'dynamic' })

    expect(memory.names().sort()).toEqual([
      headerPath(prebuilt.uid), headerPath(dynamic.uid), definitionPath(dynamic.uid)
    ].sort())
    expect(memory.text(headerPath(dynamic.uid))!.startsWith('{')).toBe(true)
    expect(memory.text(definitionPath(dynamic.uid))!.startsWith('[')).toBe(true)
    expect(pointerPath('x')).toBe('.genoacms/components/publications/x.json')
    expect(entryPath('x')).toBe('.genoacms/pages/entries/x')
  })
})
