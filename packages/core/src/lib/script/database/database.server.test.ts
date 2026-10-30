import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as storageContract from '@genoacms/contracts/storage'
import { getAlgorithm, SUBORDINATE_ALGORITHM } from '#lib/script/signing/algorithms.js'
import { deriveKeyId } from '#lib/script/signing/keyId.js'
import { sign, type SigningKey } from '#lib/script/signing/envelope.js'
import type { JsonValue } from '#lib/script/signing/canonical.js'

const environment = vi.hoisted(() => ({ building: false }))
const bucket = vi.hoisted(() => ({
  directories: {} as Record<string, string[]>,
  objects: {} as Record<string, unknown>,
  listed: [] as Array<{ name: string, bucket: string }>,
  read: [] as string[],
  pageSize: Infinity,
  failures: {} as Record<string, Error>
}))
const registry = vi.hoisted(() => ({ keys: new Map<string, Uint8Array>(), isUnreachable: false }))
const recorded = vi.hoisted(() => [] as Array<{ database: string, operation: string, reference: unknown }>)

vi.mock('$app/env', () => environment)

vi.mock('../storage/storage.server', async () => {
  const { fullyQualifiedNameToFilename } = await import('../storage/paths')
  const listPage = async (reference: { name: string, bucket: string }, params?: { pageToken?: string }) => {
    bucket.listed.push(reference)
    const names = bucket.directories[reference.name] ?? []
    const start = params?.pageToken === undefined ? 0 : Number(params.pageToken)
    const page = names.slice(start, start + bucket.pageSize)
    const files = page.map(name => ({ name: `${reference.name}${name}` }))
    return start + bucket.pageSize < names.length ? { files, directories: [], next: String(start + bucket.pageSize) } : { files, directories: [] }
  }
  const listEveryPage = async (reference: { name: string, bucket: string }) => {
    const files: unknown[] = []
    let page = await listPage(reference)
    files.push(...page.files)
    while ('next' in page) {
      page = await listPage(reference, { pageToken: (page as { next: string }).next })
      files.push(...page.files)
    }
    return { files, directories: [] }
  }
  return {
    defaultBucketId: 'media',
    fullyQualifiedNameToFilename,
    listDirectory: listPage,
    listWholeDirectory: listEveryPage,
    getObjectJSON: async (reference: { name: string, bucket: string }) => {
      bucket.read.push(reference.name)
      if (reference.name in bucket.failures) throw bucket.failures[reference.name]
      if (!(reference.name in bucket.objects)) throw new storageContract.ObjectNotFoundError(reference)
      return structuredClone(bucket.objects[reference.name])
    }
  }
})

vi.mock('#lib/script/signing/keyResolution.server.js', () => ({
  resolveVerificationKey: async (keyId: string) => {
    if (registry.isUnreachable) throw new Error('registry/unreachable')
    return registry.keys.get(keyId)
  }
}))

vi.mock('#lib/script/signing/rootKey.server.js', () => ({ loadRootKey: async () => { throw new Error('unused') } }))

const articles = { name: 'articles', primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object' } }
const logs = { name: 'logs', primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object', properties: { line: { type: 'string' } } } }

function recordingAdapter (database: string): Record<string, (reference: unknown) => Promise<unknown>> {
  const operation = (name: string) => async (reference: unknown) => {
    recorded.push({ database, operation: name, reference })
    return undefined
  }
  return {
    createDocument: operation('createDocument'),
    getCollection: operation('getCollection'),
    getDocument: operation('getDocument'),
    updateDocument: operation('updateDocument'),
    deleteDocument: operation('deleteDocument')
  }
}

vi.mock('#lib/script/host.server.js', () => {
  const adapters: Record<string, ReturnType<typeof recordingAdapter>> = { main: recordingAdapter('main'), archive: recordingAdapter('archive') }
  const notFound = (name: string) => Object.assign(new Error(name), { code: 'database/not-found' })
  return {
    host: {
      databases: ['main', 'archive'],
      collections: [articles],
      databaseForCollection: async (collection: string) => {
        if (collection === 'articles') return adapters.main
        throw notFound(collection)
      },
      databaseNamed: async (database: string) => {
        if (database in adapters) return adapters[database]
        throw notFound(database)
      }
    }
  }
})

function generatedKey (): { signing: SigningKey, publicKey: Uint8Array } {
  const keypair = getAlgorithm(SUBORDINATE_ALGORITHM).generateKeypair()
  return {
    signing: { alg: SUBORDINATE_ALGORITHM, keyId: deriveKeyId(keypair.publicKey), secretKey: keypair.secretKey },
    publicKey: keypair.publicKey
  }
}

const trusted = generatedKey()
const untrusted = generatedKey()

const signedPayload = (payload: Record<string, unknown>, key: SigningKey) =>
  sign('genoacms.collectionDefinition.v1', payload as JsonValue, key)
const signed = (database: string, definition: unknown, key: SigningKey) => signedPayload({ database, definition }, key)

const mainDirectory = '.genoacms/databases/main/collections/'
const archiveDirectory = '.genoacms/databases/archive/collections/'
const logsPath = `${archiveDirectory}logs`

async function importModule () {
  vi.resetModules()
  return await import('./database.server')
}

beforeEach(() => {
  environment.building = false
  bucket.directories = { [mainDirectory]: ['legacy', 'articles'], [archiveDirectory]: ['logs', 'legacy'] }
  bucket.objects = {}
  bucket.listed = []
  bucket.read = []
  bucket.pageSize = Infinity
  bucket.failures = {}
  registry.keys = new Map([[trusted.signing.keyId, trusted.publicKey]])
  registry.isUnreachable = false
  recorded.length = 0
})

describe('the catalog', () => {
  it('COL-1: lists the directory of every database, and catalogs configured names, then each dynamic name once', async () => {
    const { getCollectionReferences } = await importModule()

    expect(bucket.listed).toEqual([
      { name: mainDirectory, bucket: 'media' },
      { name: archiveDirectory, bucket: 'media' }
    ])
    expect(getCollectionReferences()).toEqual(['articles', 'legacy', 'logs'])
  })

  it('COL-1: a directory of more than one page lists every definition', async () => {
    bucket.pageSize = 1
    bucket.directories = { [mainDirectory]: ['articles', 'legacy'], [archiveDirectory]: ['logs', 'extra'] }
    const { getCollectionReferences } = await importModule()

    expect(getCollectionReferences()).toEqual(['articles', 'legacy', 'logs', 'extra'])
  })

  it('COL-1: lists nothing while SvelteKit analyses the build', async () => {
    environment.building = true
    const { getCollectionReferences } = await importModule()

    expect(bucket.listed).toEqual([])
    expect(getCollectionReferences()).toEqual(['articles'])
  })
})

describe('resolving a definition', () => {
  it('COL-2: a configured name resolves to its configuration, without reading the bucket', async () => {
    bucket.objects[`${mainDirectory}articles`] = signed('main', { ...articles, schema: { type: 'object', properties: { replaced: { type: 'string' } } } }, trusted.signing)
    const { getCollectionReference } = await importModule()

    expect(await getCollectionReference('articles')).toBe(articles)
    expect(bucket.read).toEqual([])
  })

  it('COL-2, COL-7: a dynamic name resolves to the definition its file carries, signed for its database and name', async () => {
    bucket.objects[logsPath] = signed('archive', logs, trusted.signing)
    const { getCollectionReference } = await importModule()

    expect(await getCollectionReference('logs')).toEqual(logs)
  })

  it('COL-2: an unreadable definition or an unknown name fails with collection/not-found', async () => {
    const { getCollectionReference } = await importModule()

    await expect(getCollectionReference('legacy')).rejects.toThrow('collection/not-found')
    await expect(getCollectionReference('nowhere')).rejects.toThrow('collection/not-found')
  })

  it('COL-2: a missing definition is collection/not-found', async () => {
    bucket.failures[logsPath] = new storageContract.ObjectNotFoundError({ bucket: 'media', name: logsPath })
    const { getCollectionReference } = await importModule()

    await expect(getCollectionReference('logs')).rejects.toThrow('collection/not-found')
  })

  it('COL-2: a storage failure while reading a definition propagates', async () => {
    const outage = new Error('boom')
    bucket.failures[logsPath] = outage
    const { getCollectionReference } = await importModule()

    await expect(getCollectionReference('logs')).rejects.toBe(outage)
  })

  it('COL-2, COL-7: a definition that does not verify fails with collection/unverifiable', async () => {
    const tampered = signed('archive', logs, trusted.signing)
    ;(tampered.payload as { definition: { schema: unknown } }).definition.schema = { type: 'object' }
    const candidates = [
      logs,
      null,
      [1, 2],
      signed('archive', logs, untrusted.signing),
      tampered,
      signed('main', logs, trusted.signing),
      signed('archive', { ...logs, name: 'other' }, trusted.signing),
      signed('archive', 7, trusted.signing),
      signedPayload({ database: 'archive', definition: logs, extra: true }, trusted.signing),
      signedPayload({ database: 'archive' }, trusted.signing)
    ]
    const { getCollectionReference } = await importModule()

    for (const candidate of candidates) {
      bucket.objects[logsPath] = candidate
      await expect(getCollectionReference('logs')).rejects.toThrow(/^collection\/unverifiable/)
    }
  })

  it('COL-2: a registry that cannot be read is not a verdict', async () => {
    bucket.objects[logsPath] = signed('archive', logs, trusted.signing)
    registry.isUnreachable = true
    const { getCollectionReference } = await importModule()

    await expect(getCollectionReference('logs')).rejects.toThrow('registry/unreachable')
  })
})

describe('the database of a collection', () => {
  it('COL-6: a configured collection is served by the database that declares it, a dynamic one by the database of its directory', async () => {
    const service = await importModule()
    const expected: Array<{ database: string, operation: string, reference: unknown }> = []

    for (const [name, database] of [['articles', 'main'], ['legacy', 'main'], ['logs', 'archive']]) {
      const collection = { ...articles, name }
      const document = { collection, id: 'one' }
      await service.createDocument(collection, {})
      await service.getCollection(collection)
      await service.getDocument(document)
      await service.updateDocument(document, {})
      await service.deleteDocument(document)
      expected.push(
        { database, operation: 'createDocument', reference: collection },
        { database, operation: 'getCollection', reference: collection },
        { database, operation: 'getDocument', reference: document },
        { database, operation: 'updateDocument', reference: document },
        { database, operation: 'deleteDocument', reference: document }
      )
    }

    expect(recorded).toEqual(expected)
  })

  it('COL-6: any other name fails with database/not-found, and no adapter is called', async () => {
    const { getCollection } = await importModule()

    await expect(getCollection({ ...articles, name: 'nowhere' })).rejects.toMatchObject({ code: 'database/not-found' })
    expect(recorded).toEqual([])
  })
})
