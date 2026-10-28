import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PreconditionFailedError } from '@genoacms/contracts/storage'
import { memory } from '$lib/script/testing/memoryStorage'
import {
  attribute, header, node, pageEntry, storeComponent, storePage, storedHeader, storedDefinition, storedPage,
  headerPath, definitionPath, entryPath
} from '$lib/script/testing/components'
import { importModule, principal, runAction, type Parsed } from '$lib/script/testing/requests'

const request = vi.hoisted(() => ({ locals: {} as Record<string, unknown> }))

vi.mock('$app/server', () => ({
  command: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'command' } }),
  form: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'form' } }),
  query: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'query' } }),
  getRequestEvent: () => request
}))
vi.mock('$lib/script/storage/providers.server', async () => (await import('$lib/script/testing/memoryStorage')).memoryProviders)
vi.mock('$lib/script/signing/keyResolution.server', async () => (await import('$lib/script/testing/signingKeys')).testKeyResolution)

const conflict = async () => await importModule('$lib/script/components/conflict')
const { updateComponent: updateComponentCommand } = await import('../../../routes/(admin)/components/registrar/[componentId]/update.remote')
const { saveComponentRemote: saveComponentForm } = await import('../../../routes/(admin)/components/editor/[componentId]/save.remote')
const { actions: registrarActions } = await import('../../../routes/(admin)/components/registrar/[componentId]/+page.server')
const { actions: editorActions } = await import('../../../routes/(admin)/components/editor/[componentId]/+page.server')
const { actions: nodeActions } = await import('../../../routes/(admin)/components/pages/[pageName]/[nodeUid]/+page.server')

const updateComponent = async (argument: unknown): Promise<Parsed> => await (updateComponentCommand as unknown as (argument: unknown) => Promise<unknown>)(argument)
const saveComponentRemote = async (argument: unknown): Promise<Parsed> => await (saveComponentForm as unknown as (argument: unknown) => Promise<unknown>)(argument)

const editor = principal(['components:read', 'components:modify', 'components:code', 'pages:read', 'pages:content_edit', 'pages:structure_edit'])

const card = header('3c1d7c52-6f4e-4f47-9d0e-1a2b3c4d5e6f', 'Card', [attribute.string('heading', 'heading')])
const source = header('7d2e8f63-7a5f-4a58-8e1f-2b3c4d5e6f70', 'Source', [], 'dynamic')

const modifiedSince = (object: string, version: string): string =>
  `conflict/modified-since: ${object} has changed since version ${version}; read it again.`

const headerVersion = (): string => memory.versionOf(headerPath(card.uid)) as string
const bodyVersion = (): string => memory.versionOf(definitionPath(source.uid)) as string
const pageVersion = (): string => memory.versionOf(entryPath('home')) as string

const saveHeader = async (name: string, version: string): Promise<Parsed> =>
  await updateComponent({ header: { ...card, name }, version })
const saveBody = async (body: string, version: string): Promise<Parsed> =>
  await saveComponentRemote({ uid: source.uid, body, version })

async function savePage (heading: string, version: string) {
  const sent = node('n1', card, { heading })
  return await runAction(nodeActions, 'update', { componentNode: JSON.stringify(sent), version }, {
    auth: editor,
    params: { pageName: 'home', nodeUid: 'n1' },
    path: '/components/pages/home/n1'
  })
}

const registrarStep = async (action: 'undo' | 'redo', version: string) =>
  await runAction(registrarActions, action, { version }, { auth: editor, params: { componentId: card.uid }, path: `/components/registrar/${card.uid}` })
const editorStep = async (action: 'undo' | 'redo', version: string) =>
  await runAction(editorActions, action, { version }, { auth: editor, params: { componentId: source.uid }, path: `/components/editor/${source.uid}` })
const pageStep = async (action: 'undo' | 'redo', version: string) =>
  await runAction(nodeActions, action, { version }, { auth: editor, params: { pageName: 'home', nodeUid: 'n1' }, path: '/components/pages/home/n1' })

beforeEach(() => {
  memory.clear()
  request.locals = { auth: editor }
  storeComponent(card)
  storeComponent(source, 'return 1')
  storePage(pageEntry('home', 'n1', [node('n1', card, { heading: 'first' })]))
})

describe('conditional saves', () => {
  it.fails('HIS-2: a save from the stored version writes and returns a new version', async () => {
    const readHeader = headerVersion()
    const savedHeader = await saveHeader('Renamed', readHeader)
    expect(savedHeader).toMatchObject({ status: 'success', text: 'Component updated', version: headerVersion() })
    expect(savedHeader.version).not.toBe(readHeader)
    expect(storedHeader(card.uid).name).toBe('Renamed')

    const readBody = bodyVersion()
    const savedBody = await saveBody('return 2', readBody)
    expect(savedBody).toMatchObject({ status: 'success', text: 'Code saved', version: bodyVersion() })
    expect(savedBody.version).not.toBe(readBody)
    expect(storedDefinition(source.uid).body).toBe('return 2')

    const readPage = pageVersion()
    const savedPage = await savePage('second', readPage)
    expect(savedPage.status).toBeLessThan(400)
    expect(pageVersion()).not.toBe(readPage)
    expect(storedPage('home').contents.nodes.n1.data.heading.value).toBe('second')

    const { writeConditionally } = await conflict()
    const write = vi.fn(async () => {})
    await writeConditionally(write, 'page home', 'v42')
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ ifVersion: 'v42' }))
  })

  it.fails('HIS-2: a save from an older version writes nothing, records no step, and fails modified-since', async () => {
    const readHeader = headerVersion()
    await saveHeader('Renamed', readHeader)
    let before = memory.snapshot()
    expect(await saveHeader('Stale', readHeader)).toEqual({ status: 'fail', text: modifiedSince(`component ${card.uid}`, readHeader) })
    expect(memory.snapshot()).toEqual(before)

    const readBody = bodyVersion()
    await saveBody('return 2', readBody)
    before = memory.snapshot()
    expect(await saveBody('return 3', readBody)).toEqual({ status: 'fail', text: modifiedSince(`component source ${source.uid}`, readBody) })
    expect(memory.snapshot()).toEqual(before)

    const readPage = pageVersion()
    await savePage('second', readPage)
    before = memory.snapshot()
    expect(await savePage('third', readPage)).toEqual({ status: 409, data: { reason: modifiedSince('page home', readPage) } })
    expect(memory.snapshot()).toEqual(before)

    const { writeConditionally, ConflictError, isConflict } = await conflict()
    const refused = await writeConditionally(async () => {
      throw new PreconditionFailedError({ bucket: 'genoacms', name: entryPath('home') }, 'version mismatch')
    }, 'page home', 'v7').catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(ConflictError)
    expect(isConflict(refused)).toBe(true)
    expect((refused as Error).message).toBe(modifiedSince('page home', 'v7'))
  })

  it.fails('HIS-2: undo and redo are conditional too', async () => {
    const readHeader = headerVersion()
    await saveHeader('Renamed', readHeader)
    let before = memory.snapshot()
    expect(await registrarStep('undo', readHeader)).toEqual({ status: 409, data: { reason: modifiedSince(`component ${card.uid}`, readHeader) } })
    expect(memory.snapshot()).toEqual(before)
    expect((await registrarStep('undo', headerVersion())).status).toBeLessThan(400)
    expect(storedHeader(card.uid).name).toBe('Card')
    const afterUndo = headerVersion()
    await registrarStep('redo', afterUndo)
    before = memory.snapshot()
    expect(await registrarStep('redo', afterUndo)).toEqual({ status: 409, data: { reason: modifiedSince(`component ${card.uid}`, afterUndo) } })
    expect(memory.snapshot()).toEqual(before)

    const readBody = bodyVersion()
    await saveBody('return 2', readBody)
    before = memory.snapshot()
    expect(await editorStep('undo', readBody)).toEqual({ status: 409, data: { reason: modifiedSince(`component source ${source.uid}`, readBody) } })
    expect(memory.snapshot()).toEqual(before)
    expect((await editorStep('undo', bodyVersion())).status).toBeLessThan(400)
    expect(storedDefinition(source.uid).body).toBe('return 1')

    const readPage = pageVersion()
    await savePage('second', readPage)
    before = memory.snapshot()
    expect(await pageStep('undo', readPage)).toEqual({ status: 409, data: { reason: modifiedSince('page home', readPage) } })
    expect(memory.snapshot()).toEqual(before)
    expect((await pageStep('undo', pageVersion())).status).toBeLessThan(400)
    expect(storedPage('home').contents.nodes.n1.data.heading.value).toBe('first')
  })

  it.fails('HIS-2: an object read without a version cannot be saved', async () => {
    const { writeConditionally, UnversionedError } = await conflict()
    const write = vi.fn(async () => {})

    const refused = await writeConditionally(write, `component ${card.uid}`, undefined).catch((error: unknown) => error)

    expect(refused).toBeInstanceOf(UnversionedError)
    expect((refused as Error).message.startsWith('storage/unversioned:')).toBe(true)
    expect(write).not.toHaveBeenCalled()
  })
})
