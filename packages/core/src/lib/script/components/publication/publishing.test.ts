import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { stringify as stringifyFlatted } from 'flatted'
import { budgetsFrom } from '@genoacms/internal/guards'
import { guardCeilings } from '#lib/script/securityPolicy/policy.js'
import { verify } from '#lib/script/signing/envelope.js'
import { memory } from '#lib/script/testing/memoryStorage.js'
import {
  attribute, header, storeComponent, storePublication, storedDefinition, storedHeader, readFlatted,
  headerPath, definitionPath, pointerPath
} from '#lib/script/testing/components.js'
import { testSecurityPolicy, signingKey, testKeyResolution } from '#lib/script/testing/signingKeys.js'
import { principal, type Parsed } from '#lib/script/testing/requests.js'

vi.setConfig({ testTimeout: 30_000 })

const request = vi.hoisted(() => ({ locals: {} as Record<string, unknown> }))
const fakes = vi.hoisted(() => ({
  adapters: {} as Record<string, unknown>,
  calls: [] as Array<[string, unknown]>,
  policyReads: 0,
  fetchOrigins: ['https://api.test'] as string[]
}))

vi.mock('$app/server', () => ({
  command: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'command' } }),
  form: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'form' } }),
  query: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'query' } }),
  getRequestEvent: () => request
}))
vi.mock('#lib/script/storage/providers.server.js', async () => (await import('#lib/script/testing/memoryStorage.js')).memoryProviders)
vi.mock('#lib/script/signing/keyResolution.server.js', async () => (await import('#lib/script/testing/signingKeys.js')).testKeyResolution)
vi.mock('#lib/script/securityPolicy/policy.server.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('#lib/script/securityPolicy/policy.server.js')>(),
  loadSecurityPolicy: async () => {
    fakes.policyReads++
    return { ...(await import('#lib/script/testing/signingKeys.js')).testSecurityPolicy, fetchOrigins: fakes.fetchOrigins }
  }
}))
vi.mock('../language.server', async (importOriginal) => {
  const original = await importOriginal<typeof import('../language.server')>()
  return { getLanguageAdapter: async (language: string) => fakes.adapters[language] ?? await original.getLanguageAdapter(language) }
})

const { publishComponent } = await import('./index')
const { publishComponentRemote: publishForm } = await import('../../../../routes/(admin)/components/registrar/[componentId]/publish.remote')
const { publishUserComponent } = await import('./user.server')
const { uploadPublication, getPublishedComponent, publishedPublicationPath } = await import('./io.server')
const { describingDigest } = await import('./payload')

const publishComponentRemote = async (argument: unknown): Promise<Parsed> => await (publishForm as unknown as (argument: unknown) => Promise<unknown>)(argument)

const publisher = principal(['components:read', 'components:modify', 'components:code'], 'publisher-7')
const UUID = '3c1d7c52-6f4e-4f47-9d0e-1a2b3c4d5e6f'
const prebuilt = header(UUID, 'Card', [attribute.string('heading', 'heading')])
const dynamic = header('7d2e8f63-7a5f-4a58-8e1f-2b3c4d5e6f70', 'Hero', [attribute.string('heading', 'heading')], 'dynamic')

type Diagnostic = { severity: string, rule: string, message: string, line?: number, column?: number, type: string }

function fakeAdapter (over: { platforms?: string[], analysis?: Diagnostic[], compiled?: Parsed } = {}): unknown {
  return {
    language: 'fake',
    platforms: over.platforms ?? ['first-platform', 'second-platform'],
    analyze: async (analysis: unknown) => { fakes.calls.push(['analyze', analysis]); return { diagnostics: over.analysis ?? [] } },
    emitSignature: () => ({ text: 'SIGNATURE', diagnostics: [] }),
    compileBundle: async (compilation: unknown) => {
      fakes.calls.push(['compile', compilation])
      return over.compiled ?? { executableCode: 'COMPILED', diagnostics: [] }
    }
  }
}

function storeFake (): void {
  storeComponent(dynamic, 'return heading')
  memory.set(definitionPath(dynamic.uid), memory.text(definitionPath(dynamic.uid))!.replace('typescript', 'fake'))
}

const canonical = (value: Parsed): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const publicationsOf = (uid: string): string[] => memory.names().filter(name => name.startsWith(`.genoacms/components/public/${uid}/`))
const order = (componentId: string) => ({ componentId, note: 'a note' })

beforeEach(() => {
  memory.clear()
  fakes.adapters = {}
  fakes.calls = []
  fakes.policyReads = 0
  fakes.fetchOrigins = ['https://api.test']
  request.locals = { auth: publisher }
})

describe('publishing', () => {
  it('PUB-1: a prebuilt component writes the publication and then the pointer, and no definition', async () => {
    storeComponent(prebuilt)

    const { record } = await publishComponent(order(prebuilt.uid), 'publisher-7')

    expect(publicationsOf(prebuilt.uid)).toEqual([publishedPublicationPath(prebuilt.uid, record.publicationId)])
    expect(readFlatted(pointerPath(prebuilt.uid))).toMatchObject({ uid: prebuilt.uid, publicationId: record.publicationId })
    expect(memory.has(definitionPath(prebuilt.uid))).toBe(false)
  })

  it('PUB-1: a component with no header is refused with components/no-such-component and nothing is written', async () => {
    await expect(publishUserComponent(publisher, order(UUID))).rejects.toThrow(`components/no-such-component: ${UUID} does not exist.`)

    expect(memory.names()).toEqual([])
  })

  it('PUB-1: the permissions are checked first, and nothing is written before the last step', async () => {
    storeComponent(prebuilt)
    storeComponent(dynamic, 'return eval("1")')
    const before = memory.snapshot()

    await expect(publishUserComponent(principal(['components:read']), order(prebuilt.uid))).rejects.toThrow(/permission-denied/)
    await expect(publishUserComponent(principal(['components:modify']), order(dynamic.uid))).rejects.toThrow(/permission-denied/)
    await expect(publishUserComponent(publisher, order(dynamic.uid))).rejects.toThrow()
    expect(memory.snapshot()).toEqual(before)
  })

  it('PUB-1: the publisher is the principal\'s subject, never a value of the request', async () => {
    storeComponent(prebuilt)

    const { record } = await publishUserComponent(publisher, { ...order(prebuilt.uid), publisherId: 'someone-else' } as never)

    const [path] = publicationsOf(prebuilt.uid)
    expect(record.publisherId).toBe('publisher-7')
    expect(memory.json(path).payload.publisherId).toBe('publisher-7')
    expect(readFlatted(pointerPath(prebuilt.uid)).publisherId).toBe('publisher-7')
  })

  it('PUB-1: the publication id is a random UUID, and the time is milliseconds since epoch', async () => {
    storeComponent(prebuilt)
    const started = Date.now()

    const { record } = await publishComponent(order(prebuilt.uid), 'publisher-7')

    expect(record.publicationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(record.publishedAt).toBeGreaterThanOrEqual(started)
    expect(record.publishedAt).toBeLessThanOrEqual(Date.now())
  })

  it('PUB-1: the security policy is read once for a dynamic component', async () => {
    fakes.adapters.fake = fakeAdapter()
    storeFake()

    await publishComponent(order(dynamic.uid), 'publisher-7')

    expect(fakes.policyReads).toBe(1)
  })
})

describe('no change, no publication', () => {
  const refusal = 'Nothing has changed since the last publication: neither the component\'s description nor, where it has one, its code.'

  it('PUB-2: a component with no pointer may be published', async () => {
    storeComponent(prebuilt)

    await expect(publishComponent(order(prebuilt.uid), 'p')).resolves.toBeDefined()
  })

  it('PUB-2: an unchanged component is refused with the stated message and nothing is written', async () => {
    storeComponent(prebuilt)
    await publishComponent(order(prebuilt.uid), 'p')
    const before = memory.snapshot()

    await expect(publishComponent(order(prebuilt.uid), 'p')).rejects.toThrow(refusal)
    expect(memory.snapshot()).toEqual(before)
  })

  it('PUB-2: a changed description may be published, a changed body of a dynamic component may be published', async () => {
    fakes.adapters.fake = fakeAdapter()
    storeFake()
    await publishComponent(order(dynamic.uid), 'p')
    await expect(publishComponent(order(dynamic.uid), 'p')).rejects.toThrow(refusal)

    const renamed = { ...storedHeader(dynamic.uid), name: 'Hero 2' }
    memory.set(headerPath(dynamic.uid), JSON.stringify(renamed))
    await expect(publishComponent(order(dynamic.uid), 'p')).resolves.toBeDefined()
    await expect(publishComponent(order(dynamic.uid), 'p')).rejects.toThrow(refusal)

    const edited = { ...storedDefinition(dynamic.uid), body: 'return heading + 1' }
    memory.set(definitionPath(dynamic.uid), stringifyFlatted(edited))
    await expect(publishComponent(order(dynamic.uid), 'p')).resolves.toBeDefined()
  })

  it('PUB-2: the digest is the lowercase hex of SHA-256 over the RFC 8785 form of type, name, attributes and attributeOrder', () => {
    const described = header(UUID, 'Card', [attribute.string('heading', 'heading'), attribute.number('n', 'count')])
    const form = canonical({ type: described.type, name: described.name, attributes: described.attributes, attributeOrder: described.attributeOrder })

    expect(describingDigest(described as never)).toBe(createHash('sha256').update(form).digest('hex'))
  })

  it('PUB-2: a pointer whose digest differs allows publishing, whatever else it says', async () => {
    storeComponent(prebuilt)
    storePublication(prebuilt.uid)

    await expect(publishComponent(order(prebuilt.uid), 'p')).resolves.toBeDefined()
  })
})

describe('analysis and compilation', () => {
  it('PUB-3: the adapter of the definition\'s language analyzes and compiles with the shape, the first platform and the one policy reading', async () => {
    fakes.adapters.fake = fakeAdapter()
    storeFake()

    const { record } = await publishComponent(order(dynamic.uid), 'p')

    const shape = { attributes: dynamic.attributes, attributeOrder: dynamic.attributeOrder }
    const ceilings = guardCeilings({ ...testSecurityPolicy, fetchOrigins: ['https://api.test'] })
    expect(fakes.calls).toEqual([
      ['analyze', { body: 'return heading', shape, fetchOrigins: ['https://api.test'] }],
      ['compile', { body: 'return heading', shape, platform: 'first-platform', ceilings: budgetsFrom(ceilings), fetchOrigins: ['https://api.test'] }]
    ])
    expect(fakes.policyReads).toBe(1)
    const published = memory.json(publishedPublicationPath(dynamic.uid, record.publicationId)).payload
    expect(published.executables).toEqual([
      expect.objectContaining({ platform: 'first-platform', executableCode: 'COMPILED', ceilings })
    ])
  })

  it.each([
    ['analysis', { analysis: [{ type: 'language-rule', severity: 'fatal', rule: 'r', message: 'bad thing', line: 3 }] }, 'bad thing (line 3)'],
    ['analysis', { analysis: [{ type: 'language-rule', severity: 'fatal', rule: 'r', message: 'bad thing', line: 3, column: 9 }] }, 'bad thing (line 3, column 9)'],
    ['analysis', { analysis: [{ type: 'language-rule', severity: 'fatal', rule: 'r', message: 'bad thing' }] }, 'bad thing'],
    ['compilation', { compiled: { diagnostics: [{ type: 'language-rule', severity: 'fatal', rule: 'r', message: 'cannot build', line: 1 }] } }, 'cannot build (line 1)']
  ])('PUB-3: the first fatal diagnostic of %s refuses the publication with its message and writes nothing', async (_stage, over, message) => {
    fakes.adapters.fake = fakeAdapter(over as never)
    storeFake()
    const before = memory.snapshot()

    await expect(publishComponent(order(dynamic.uid), 'p')).rejects.toThrow(new RegExp(`^${message.replace(/[()]/g, '\\$&')}$`))
    expect(memory.snapshot()).toEqual(before)
  })

  it('PUB-3: an adapter with no platform refuses, as does a compilation with no code and no fatal diagnostic', async () => {
    fakes.adapters.fake = fakeAdapter({ platforms: [] })
    storeFake()
    await expect(publishComponent(order(dynamic.uid), 'p')).rejects.toThrow("The adapter for 'fake' declares no platform to compile for")

    fakes.adapters.fake = fakeAdapter({ compiled: { diagnostics: [] } })
    await expect(publishComponent(order(dynamic.uid), 'p')).rejects.toThrow("The adapter for 'fake' returned no code and gave no reason")
    expect(publicationsOf(dynamic.uid)).toEqual([])
  })

  it('PUB-3: the warnings of the analysis are returned to the publisher', async () => {
    const warning = { type: 'language-rule', severity: 'warning', rule: 'w', message: 'careful', line: 2 }
    fakes.adapters.fake = fakeAdapter({ analysis: [warning] })
    storeFake()

    const { warnings } = await publishComponent(order(dynamic.uid), 'p')

    expect(warnings).toEqual([warning])
  })
})

describe('the publication', () => {
  it('PUB-4: is a genoacms.componentPublication.v1 envelope signed by the current subordinate key, with the stated fields', async () => {
    fakes.adapters.fake = fakeAdapter()
    storeFake()
    const before = Date.now()

    const { record } = await publishComponent({ componentId: dynamic.uid, note: '' }, 'publisher-7')

    const envelope = memory.json(publishedPublicationPath(dynamic.uid, record.publicationId))
    expect(Object.keys(envelope.payload).sort()).toEqual([
      'attributeOrder', 'attributes', 'executables', 'name', 'note', 'publicationId', 'publishedAt', 'publisherId', 'type', 'uid'
    ])
    expect(envelope.payload).toMatchObject({
      uid: dynamic.uid, publicationId: record.publicationId, publisherId: 'publisher-7', publishedAt: record.publishedAt,
      note: '', type: 'dynamic', name: 'Hero', attributes: dynamic.attributes, attributeOrder: dynamic.attributeOrder
    })
    expect(envelope.payload.executables).toHaveLength(1)
    expect(Object.keys(envelope.payload.executables[0]).sort()).toEqual(['ceilings', 'compiledAt', 'executableCode', 'platform'])
    expect(envelope.payload.executables[0].compiledAt).toBeGreaterThanOrEqual(before)
    expect(Object.keys(envelope.payload.executables[0].ceilings).sort()).toEqual(['maxAllocation', 'maxDepth', 'maxFuel'])
    expect(JSON.stringify(envelope)).toContain('genoacms.componentPublication.v1')
    expect(envelope.keyId).toBe(signingKey.keyId)
    const publicKey = await testKeyResolution.resolveVerificationKey(signingKey.keyId) as Uint8Array
    expect(verify(envelope, 'genoacms.componentPublication.v1', publicKey).valid).toBe(true)
  })

  it('PUB-4: a prebuilt component\'s publication has no executables key', async () => {
    storeComponent(prebuilt)

    const { record } = await publishComponent(order(prebuilt.uid), 'p')

    expect(memory.json(publishedPublicationPath(prebuilt.uid, record.publicationId)).payload).not.toHaveProperty('executables')
  })

  it('PUB-4: refuses a blank uid or name, an infinite timestamp, and ceilings that are not three positive whole numbers', async () => {
    const { buildComponentPublication } = await import('./payload')
    const subject = { publicationId: 'p', publisherId: 'u', publishedAt: 1, note: '' }
    const bundle = (ceilings: Parsed) => ({ platform: 'web', executableCode: 'x', compiledAt: 1, ceilings })
    const good = { maxFuel: 1, maxDepth: 1, maxAllocation: 1 }
    const dyn = (over: Parsed = {}) => ({ ...dynamic, ...over }) as never

    expect(() => buildComponentPublication(subject, dyn({ uid: ' ' }), [bundle(good)])).toThrow()
    expect(() => buildComponentPublication(subject, dyn({ name: '' }), [bundle(good)])).toThrow()
    expect(() => buildComponentPublication({ ...subject, publishedAt: Infinity }, dyn(), [bundle(good)])).toThrow()
    for (const bad of [
      { maxFuel: 0 }, { maxDepth: -1 }, { maxAllocation: 1.5 }, { maxFuel: Number.NaN }, { maxFuel: '1' },
      { maxFuel: undefined }, { maxDepth: Infinity }
    ]) {
      expect(() => buildComponentPublication(subject, dyn(), [bundle({ ...good, ...bad })]), JSON.stringify(bad)).toThrow()
    }
    expect(() => buildComponentPublication(subject, dyn(), [bundle(good)])).not.toThrow()
  })
})

describe('writing a publication', () => {
  it('PUB-5: the publication is written once at the path its uid and publicationId name; an existing object fails with components/publication-exists', async () => {
    storeComponent(prebuilt)
    const { record } = await publishComponent(order(prebuilt.uid), 'p')
    const path = publishedPublicationPath(prebuilt.uid, record.publicationId)
    const envelope = memory.json(path)

    await expect(uploadPublication(envelope)).rejects.toThrow(/^components\/publication-exists:/)
    expect(memory.json(path)).toEqual(envelope)
  })

  it('PUB-5: the pointer names the latest publication, and a dynamic component\'s definition records what was compiled', async () => {
    fakes.adapters.fake = fakeAdapter()
    storeFake()

    const first = await publishComponent(order(dynamic.uid), 'p')
    expect(readFlatted(pointerPath(dynamic.uid))).toEqual({
      uid: dynamic.uid, publicationId: first.record.publicationId, publisherId: 'p', publishedAt: first.record.publishedAt,
      note: 'a note', headerDigest: describingDigest(dynamic as never)
    })
    expect(storedDefinition(dynamic.uid)).toMatchObject({ publishedBody: 'return heading', publishedSignature: 'SIGNATURE', body: 'return heading' })

    memory.set(headerPath(dynamic.uid), JSON.stringify({ ...dynamic, name: 'Hero 2' }))
    const second = await publishComponent(order(dynamic.uid), 'p')
    expect(readFlatted(pointerPath(dynamic.uid)).publicationId).toBe(second.record.publicationId)
    expect(publicationsOf(dynamic.uid)).toHaveLength(2)
  })

  it('PUB-5: a pointer that cannot be read is no pointer; one that does not match fails the read', async () => {
    expect(await getPublishedComponent(UUID)).toBeNull()

    memory.set(pointerPath(UUID), 'not flatted')
    expect(await getPublishedComponent(UUID)).toBeNull()

    memory.set(pointerPath(UUID), JSON.stringify([{ uid: UUID }]))
    await expect(getPublishedComponent(UUID)).rejects.toThrow(`Invalid publication record for component ${UUID}`)
  })
})

describe('what publishing answers', () => {
  it('PUB-6: success carries the publication id, the time and the warnings', async () => {
    const warning = { type: 'language-rule', severity: 'warning', rule: 'w', message: 'careful', line: 2 }
    const unlocated = { type: 'language-rule', severity: 'warning', rule: 'v', message: 'elsewhere' }
    fakes.adapters.fake = fakeAdapter({ analysis: [warning, unlocated] })
    storeFake()

    const answer = await publishComponentRemote({ componentId: dynamic.uid, note: 'n' })

    expect(answer).toEqual({
      status: 'success',
      text: 'Component published',
      publicationId: readFlatted(pointerPath(dynamic.uid)).publicationId,
      publishedAt: readFlatted(pointerPath(dynamic.uid)).publishedAt,
      warnings: [{ rule: 'w', message: 'careful', line: 2 }, { rule: 'v', message: 'elsewhere' }]
    })
  })

  it('PUB-6: an invalid argument is answered Invalid data', async () => {
    for (const argument of [{}, { componentId: 'not-a-uuid', note: '' }, { componentId: UUID, note: 3 }, { componentId: UUID }, { note: '' }]) {
      expect(await publishComponentRemote(argument), JSON.stringify(argument)).toEqual({ status: 'fail', text: 'Invalid data' })
    }
    expect(memory.names()).toEqual([])
  })

  it('PUB-6: every failure is answered with the error\'s message, a permission denial included', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    storeComponent(prebuilt)

    request.locals = { auth: principal(['components:read']) }
    const denied = await publishComponentRemote({ componentId: prebuilt.uid, note: '' })
    expect(denied.status).toBe('fail')
    expect(denied.text).toMatch(/lacks components:modify/)

    request.locals = { auth: publisher }
    const missing = await publishComponentRemote({ componentId: '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', note: '' })
    expect(missing).toEqual({ status: 'fail', text: 'components/no-such-component: 6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d does not exist.' })

    await publishComponentRemote({ componentId: prebuilt.uid, note: '' })
    const unchanged = await publishComponentRemote({ componentId: prebuilt.uid, note: '' })
    expect(unchanged.status).toBe('fail')
    expect(unchanged.text.startsWith('Nothing has changed since the last publication')).toBe(true)
  })
})
