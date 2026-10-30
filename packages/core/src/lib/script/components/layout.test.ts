import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validator } from '@exodus/schemasafe'
import { memory } from '#lib/script/testing/memoryStorage.js'
import {
  attribute, header, node, pageEntry, storeComponent, storePublishedComponent, storePage, storedPage, readFlatted,
  headerPath, headerHistoryPath, definitionPath, definitionHistoryPath, pointerPath, entryPath, treePath
} from '#lib/script/testing/components.js'
import { principal, runAction, type Parsed } from '#lib/script/testing/requests.js'
import { attributeTypeInits } from './componentHeader/component/attributeInits'
import { componentHeaderSchema } from './componentHeader/component/schemas'
import { requireDistinctAttributeNames, requireUnreservedAttributeNames } from './componentHeader/component/attributeNames'

vi.setConfig({ testTimeout: 30_000 })

const request = vi.hoisted(() => ({ locals: {} as Record<string, unknown> }))
const writes = vi.hoisted(() => ({ names: [] as string[] }))

vi.mock('$app/server', () => ({
  command: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'command' } }),
  form: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'form' } }),
  query: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'query' } }),
  getRequestEvent: () => request
}))
vi.mock('#lib/script/storage/providers.server.js', async () => {
  const { memoryProviders } = await import('#lib/script/testing/memoryStorage.js')
  return {
    ...memoryProviders,
    uploadObject: async (reference: { name: string }, data: unknown, options: unknown) => {
      writes.names.push(reference.name)
      return await memoryProviders.uploadObject(reference as never, data as never, options as never)
    }
  }
})
vi.mock('#lib/script/signing/keyResolution.server.js', async () => (await import('#lib/script/testing/signingKeys.js')).testKeyResolution)
vi.mock('#lib/script/securityPolicy/policy.server.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('#lib/script/securityPolicy/policy.server.js')>(),
  loadSecurityPolicy: async () => (await import('#lib/script/testing/signingKeys.js')).testSecurityPolicy
}))

const { createComponent: createComponentCommand } = await import('../../../routes/(admin)/components/registrar/create.remote')
const { updateComponent: updateComponentCommand } = await import('../../../routes/(admin)/components/registrar/[componentId]/update.remote')
const { saveComponentRemote: saveComponentForm } = await import('../../../routes/(admin)/components/editor/[componentId]/save.remote')
const { publishComponentRemote: publishForm } = await import('../../../routes/(admin)/components/registrar/[componentId]/publish.remote')
const registrarOne = await import('../../../routes/(admin)/components/registrar/[componentId]/+page.server')
const editorOne = await import('../../../routes/(admin)/components/editor/[componentId]/+page.server')
const nodeRoute = await import('../../../routes/(admin)/components/pages/[pageName]/[nodeUid]/+page.server')
const pagesList = await import('../../../routes/(admin)/components/pages/+page.server')
const { listComponentHeaderReferences, getComponentHeaderHistory } = await import('./componentHeader/io.server')
const { getComponentDefinitionHistory } = await import('./editor/io')

const call = async (fn: unknown, argument: unknown): Promise<Parsed> => await (fn as (argument: unknown) => Promise<unknown>)(argument)
const everything = principal(['*'])
const hero = header('7d2e8f63-7a5f-4a58-8e1f-2b3c4d5e6f70', 'Hero', [attribute.string('heading', 'heading')], 'dynamic')
const card = header('3c1d7c52-6f4e-4f47-9d0e-1a2b3c4d5e6f', 'Card', [attribute.string('heading', 'heading')])
const version = (name: string): string => memory.versionOf(name) as string

beforeEach(() => {
  memory.clear()
  writes.names = []
  request.locals = { auth: everything }
})

afterEach(() => { vi.restoreAllMocks() })

describe('what is stored, and where', () => {
  it('CMP-1: each object is at its path, in its form, and written when the table says', async () => {
    const created = await call(createComponentCommand, { name: 'Hero', type: 'dynamic' })
    const uid = created.uid as string
    const jsonText = (path: string) => memory.text(path)!.startsWith('{')
    const flattedText = (path: string) => memory.text(path)!.startsWith('[')

    expect(memory.names().sort()).toEqual([headerPath(uid), definitionPath(uid)].sort())
    expect(jsonText(headerPath(uid))).toBe(true)
    expect(flattedText(definitionPath(uid))).toBe(true)

    const created1 = version(headerPath(uid))
    await call(updateComponentCommand, { header: { ...storedHeaderOf(uid), name: 'Renamed' }, version: created1 })
    expect(version(headerPath(uid))).not.toBe(created1)
    expect(flattedText(headerHistoryPath(uid))).toBe(true)

    await call(saveComponentForm, { uid, body: 'return 1', version: version(definitionPath(uid)) })
    expect(flattedText(definitionHistoryPath(uid))).toBe(true)

    await runAction(registrarOne.actions, 'undo', { version: version(headerPath(uid)) }, { auth: everything, params: { componentId: uid } })
    expect(storedHeaderOf(uid).name).toBe('Hero')
    const redoBase = version(headerPath(uid))
    await runAction(registrarOne.actions, 'redo', { version: redoBase }, { auth: everything, params: { componentId: uid } })
    expect(version(headerPath(uid))).not.toBe(redoBase)
    expect(storedHeaderOf(uid).name).toBe('Renamed')

    await runAction(editorOne.actions, 'undo', { version: version(definitionPath(uid)) }, { auth: everything, params: { componentId: uid } })
    expect(readFlatted(definitionPath(uid)).body).toBe('')

    const beforePublish = version(definitionPath(uid))
    await call(saveComponentForm, { uid, body: 'return 2', version: beforePublish })
    const saved = version(definitionPath(uid))
    const published = await call(publishForm, { componentId: uid, note: '' })
    expect(published.status).toBe('success')
    expect(version(definitionPath(uid))).not.toBe(saved)
    const publicationPath = `.genoacms/components/public/${uid}/${published.publicationId}.json`
    expect(memory.has(publicationPath)).toBe(true)
    expect(jsonText(publicationPath)).toBe(true)
    expect(memory.json(publicationPath)).toHaveProperty('signature')
    expect(flattedText(pointerPath(uid))).toBe(true)
    expect(readFlatted(pointerPath(uid)).publicationId).toBe(published.publicationId)
  })

  it('CMP-1: a page entry is flatted, written on every page edit, and a published tree is signed JSON written on every build', async () => {
    storePublishedComponent(card)
    await runAction(pagesList.actions, 'createPage', { name: 'home', componentUID: card.uid }, { auth: everything })
    const created = version(entryPath('home'))
    expect(memory.text(entryPath('home'))!.startsWith('[')).toBe(true)
    const rootUid = storedPage('home').contents.rootNodeUid

    const sent = JSON.stringify(node(rootUid, card, { heading: 'edited' }))
    await runAction(nodeRoute.actions, 'update', { componentNode: sent, version: created }, { auth: everything, params: { pageName: 'home', nodeUid: rootUid } })
    const edited = version(entryPath('home'))
    expect(edited).not.toBe(created)
    expect(memory.has(treePath('home'))).toBe(false)

    await runAction(nodeRoute.actions, 'updateAndGenerateTree', { componentNode: sent, version: edited }, { auth: everything, params: { pageName: 'home', nodeUid: rootUid } })
    expect(memory.text(treePath('home'))!.startsWith('{')).toBe(true)
    expect(memory.json(treePath('home'))).toHaveProperty('signature')
    const firstBuild = version(treePath('home'))
    await runAction(nodeRoute.actions, 'updateAndGenerateTree', { componentNode: sent, version: version(entryPath('home')) }, { auth: everything, params: { pageName: 'home', nodeUid: rootUid } })
    expect(version(treePath('home'))).not.toBe(firstBuild)
  })

  it('CMP-1: a file in headers/ whose name ends in .history is not a component; the references are the other names without .json', async () => {
    storeComponent(card)
    memory.set(headerHistoryPath(card.uid), '[{"history":"1","future":"2"},[],[]]')
    memory.set(headerHistoryPath('orphan'), '[{"history":"1","future":"2"},[],[]]')

    expect(await listComponentHeaderReferences()).toEqual([card.uid])
  })
})

const storedHeaderOf = (uid: string): Parsed => memory.json(headerPath(uid))

describe('stepping a history', () => {
  it('HIS-1: the state is written before its history', async () => {
    storeComponent(card)
    storeComponent(hero)
    storePage(pageEntry('home', 'n1', [node('n1', card, { heading: 'first' })]))

    await call(updateComponentCommand, { header: { ...card, name: 'Renamed' }, version: version(headerPath(card.uid)) })
    await call(saveComponentForm, { uid: hero.uid, body: 'return 1', version: version(definitionPath(hero.uid)) })

    expect(writes.names.indexOf(headerPath(card.uid))).toBeGreaterThanOrEqual(0)
    expect(writes.names.indexOf(headerPath(card.uid))).toBeLessThan(writes.names.indexOf(headerHistoryPath(card.uid)))
    expect(writes.names.indexOf(definitionPath(hero.uid))).toBeGreaterThanOrEqual(0)
    expect(writes.names.indexOf(definitionPath(hero.uid))).toBeLessThan(writes.names.indexOf(definitionHistoryPath(hero.uid)))
  })

  it('HIS-1: a history whose history or future is not an array is replaced by an empty one, with a console warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    memory.set(headerHistoryPath(card.uid), '[{"history":"1","future":"2"},"not an array",[]]')
    memory.set(definitionHistoryPath(hero.uid), '[{"history":"1","future":"2"},[],"not an array"]')

    expect(await getComponentHeaderHistory(card.uid)).toEqual({ history: [], future: [] })
    expect(await getComponentDefinitionHistory(hero.uid)).toEqual({ history: [], future: [] })
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('HIS-1: an absent history is empty', async () => {
    expect(await getComponentHeaderHistory(card.uid)).toEqual({ history: [], future: [] })
    expect(await getComponentDefinitionHistory(hero.uid)).toEqual({ history: [], future: [] })
  })

  it('HIS-1: for a header and a body an undo with nothing to step writes nothing; a page entry is written anyway', async () => {
    storeComponent(card)
    storeComponent(hero)
    storePage(pageEntry('home', 'n1', [node('n1', card)]))
    const before = memory.snapshot()

    await runAction(registrarOne.actions, 'undo', { version: version(headerPath(card.uid)) }, { auth: everything, params: { componentId: card.uid } })
    await runAction(editorOne.actions, 'undo', { version: version(definitionPath(hero.uid)) }, { auth: everything, params: { componentId: hero.uid } })
    expect(memory.snapshot()).toEqual(before)

    const page = version(entryPath('home'))
    await runAction(nodeRoute.actions, 'undo', { version: page }, { auth: everything, params: { pageName: 'home', nodeUid: 'n1' } })
    expect(version(entryPath('home'))).not.toBe(page)
  })
})

describe('attribute names', () => {
  it('CMP-5: a duplicate name is refused with components/duplicate-attribute-name quoting each shared name, an empty one as an empty name', () => {
    const duplicated = header(card.uid, 'Card', [
      attribute.string('a', 'Heading'), attribute.string('b', 'Heading'),
      attribute.string('c', '  Body '), attribute.string('d', 'Body'),
      attribute.string('e', ''), attribute.string('f', '  ')
    ])

    expect(() => requireDistinctAttributeNames(duplicated as never)).toThrow(/^components\/duplicate-attribute-name: /)
    expect(() => requireDistinctAttributeNames(duplicated as never)).toThrow(/"Heading"/)
    expect(() => requireDistinctAttributeNames(duplicated as never)).toThrow(/"Body"/)
    expect(() => requireDistinctAttributeNames(duplicated as never)).toThrow(/an empty name/)
  })

  it('CMP-5: names compared as trimmed and case-sensitive', () => {
    const distinct = header(card.uid, 'Card', [attribute.string('a', 'Heading'), attribute.string('b', 'heading')])
    const same = header(card.uid, 'Card', [attribute.string('a', 'Heading'), attribute.string('b', ' Heading')])

    expect(() => requireDistinctAttributeNames(distinct as never)).not.toThrow()
    expect(() => requireDistinctAttributeNames(same as never)).toThrow(/^components\/duplicate-attribute-name: /)
  })

  it('CMP-5: an attribute named passthrough is refused with components/reserved-attribute-name', () => {
    const reserved = header(card.uid, 'Card', [attribute.string('a', 'passthrough')])

    expect(() => requireUnreservedAttributeNames(reserved as never)).toThrow(/^components\/reserved-attribute-name: /)
  })

  it('CMP-5: saving refuses before anything is read or written, so even an unknown component answers with the refusal', async () => {
    const before = memory.snapshot()

    const duplicate = await call(updateComponentCommand, { header: header(card.uid, 'Card', [attribute.string('a', 'X'), attribute.string('b', 'X')]), version: 'v1' })
    const reserved = await call(updateComponentCommand, { header: header(card.uid, 'Card', [attribute.string('a', 'passthrough')]), version: 'v1' })

    expect(duplicate.status).toBe('fail')
    expect(duplicate.text.startsWith('components/duplicate-attribute-name:')).toBe(true)
    expect(reserved.status).toBe('fail')
    expect(reserved.text.startsWith('components/reserved-attribute-name:')).toBe(true)
    expect(memory.snapshot()).toEqual(before)
  })
})

describe('attributes', () => {
  const validate = validator(componentHeaderSchema)
  const withAttribute = (item: Parsed): boolean => validate(JSON.parse(JSON.stringify(header(card.uid, 'Card', [item]))))
  const permitted: Array<[string, (constraints: Parsed) => Parsed, Parsed]> = [
    ['boolean', constraints => attribute.boolean('a', 't', constraints), { default: true }],
    ['number', constraints => attribute.number('a', 't', constraints), { minimum: 0, maximum: 9, multipleOf: 3, decimalPlaces: 1, default: 3 }],
    ['string', constraints => attribute.string('a', 't', constraints), { minLength: 1, maxLength: 9, pattern: 'a', format: 'email', default: 'a@b.cd' }],
    ['text', constraints => attribute.string('a', 't', constraints, 'text'), { minLength: 1, maxLength: 9, pattern: 'a', format: 'email', default: 'a' }],
    ['markdown', constraints => attribute.string('a', 't', constraints, 'markdown'), { minLength: 1, maxLength: 9, pattern: 'a', format: 'email', default: 'a' }],
    ['richText', constraints => attribute.string('a', 't', constraints, 'richText'), { minLength: 1, maxLength: 9, pattern: 'a', format: 'email', default: 'a' }],
    ['link', constraints => attribute.link('a', 't', constraints), { minItems: 1, maxItems: 2 }],
    ['storageResource', constraints => attribute.storageResource('a', 't', constraints), { minItems: 1, maxItems: 2 }],
    ['components', constraints => attribute.components('a', 't', ['Card'], constraints), { minItems: 1, maxItems: 2, default: ['x'] }]
  ]

  it.each(permitted)('CMP-3: a %s attribute may carry the constraints of its type', (_type, make, constraints) => {
    expect(withAttribute(make({}))).toBe(true)
    for (const [key, value] of Object.entries(constraints)) {
      expect(withAttribute(make({ [key]: value })), key).toBe(true)
    }
  })

  it.each(permitted)('CMP-3: a %s attribute carries no constraint of another type and no null in place of an unset one', (_type, make, constraints) => {
    const foreign = ['minimum', 'minLength', 'minItems', 'multipleOf', 'pattern'].filter(key => !(key in constraints))
    for (const key of foreign) expect(withAttribute(make({ [key]: 1 })), key).toBe(false)
    for (const key of Object.keys(constraints)) {
      for (const empty of [null]) expect(withAttribute(make({ [key]: empty })), `${key}: ${String(empty)}`).toBe(false)
    }
  })

  it('CMP-3: every schema a new attribute starts with has title, description and required, and the schema.type of its attribute type', () => {
    const schemaTypes: Record<string, string> = {
      boolean: 'boolean', number: 'number', string: 'string', text: 'string', markdown: 'string', richText: 'string',
      link: 'array', storageResource: 'array', components: 'array'
    }

    expect(attributeTypeInits.map(init => init.name).sort()).toEqual(Object.keys(schemaTypes).sort())
    for (const { name, schema } of attributeTypeInits) {
      const json = JSON.parse(JSON.stringify(schema))
      expect(Object.keys(json), name).toEqual(expect.arrayContaining(['title', 'description', 'required']))
      expect(json.type, name).toBe(schemaTypes[name])
    }
  })

  it('CMP-3: an attribute is refused under a schema.type that is not its attribute type', () => {
    for (const [type, make] of permitted) {
      const item = make({})
      expect(withAttribute({ ...item, schema: { ...item.schema, type: item.schema.type === 'string' ? 'number' : 'string' } }), `${type} with another schema.type`).toBe(false)
      expect(withAttribute({ ...item, type: type === 'boolean' ? 'number' : 'boolean' }), `${type} under another type`).toBe(false)
    }
  })

  it.fails('CMP-3: a link attribute may carry a default list of links, the value form of a page', () => {
    expect(withAttribute(attribute.link('a', 't', { default: [{ isExternal: true, url: 'https://a.test' }] }))).toBe(true)
  })

  it.fails('CMP-3: a storageResource attribute may carry a default list of objects, the value form of a page', () => {
    expect(withAttribute(attribute.storageResource('a', 't', { default: [{ bucket: 'b', name: 'n' }] }))).toBe(true)
  })

  it('CMP-3: a components slot\'s items.enum accepts component names, and an absent or empty one accepts any', () => {
    expect(withAttribute(attribute.components('a', 't', ['Card', 'Hero']))).toBe(true)
    expect(withAttribute(attribute.components('a', 't', []))).toBe(true)
    expect(withAttribute(attribute.components('a', 't'))).toBe(true)
  })

  it('CMP-4: matches CMP-2 with no other top-level field', () => {
    const valid = JSON.parse(JSON.stringify(card))

    expect(validate(valid)).toBe(true)
    expect(validate({ ...valid, history: [] })).toBe(false)
    expect(validate({ ...valid, type: 'other' })).toBe(false)
    const { name: _name, ...withoutName } = valid
    expect(validate(withoutName)).toBe(false)
  })
})
