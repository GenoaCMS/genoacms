import { randomUUID } from 'node:crypto'
import { DocumentNotFoundError } from '@genoacms/contracts/database'
import type { Adapter, CollectionReference } from '@genoacms/contracts/database'
import { checkQuery, checkValues, decodeToken, encodeToken, matches } from '@genoacms/contracts/database/query'
import type { Parsed } from './requests'

type Data = Record<string, unknown>

const collections: Map<string, Map<string, Data>> = ((globalThis as Parsed).__genoacmsMemoryDatabase ??= new Map())

const documentsOf = (collection: string): Map<string, Data> => {
  let documents = collections.get(collection)
  if (documents === undefined) collections.set(collection, documents = new Map())
  return documents
}

const withKey = (reference: CollectionReference, id: string, data: Data): Data =>
  ({ ...data, [reference.primaryKey.key]: id })

const withoutKey = (reference: CollectionReference, data: Data): Data => {
  const { [reference.primaryKey.key]: _key, ...rest } = data
  return rest
}

const idsInOrder = (collection: string): string[] => [...documentsOf(collection).keys()].sort()

const afterToken = (token: string | undefined): string | undefined => {
  if (token === undefined) return undefined
  const value = decodeToken(token)
  if (typeof value?.after !== 'string') throw new Error('database/invalid-query: unknown page token')
  return value.after
}

const getCollection: Adapter['getCollection'] = async (reference, params) => {
  checkQuery(params)
  const after = afterToken(params?.pageToken)
  const matching = idsInOrder(reference.name)
    .filter(id => after === undefined || id > after)
    .map(id => ({ id, data: withKey(reference, id, documentsOf(reference.name).get(id) as Data) }))
    .filter(({ data }) => matches(data, params?.where ?? []))
  const limit = params?.limit
  const page = limit === undefined ? matching : matching.slice(0, limit)
  const documents = page.map(({ id, data }) => ({ reference: { collection: reference, id }, data })) as never
  const full = limit !== undefined && page.length === limit
  return full ? { documents, next: encodeToken({ after: page[page.length - 1].id }) } : { documents }
}

const getDocument: Adapter['getDocument'] = async (reference) => {
  const stored = documentsOf(reference.collection.name).get(reference.id)
  return stored === undefined ? undefined : { reference, data: withKey(reference.collection, reference.id, stored) } as never
}

const createDocument: Adapter['createDocument'] = async (reference, document) => {
  checkValues(document)
  const id = randomUUID()
  documentsOf(reference.name).set(id, structuredClone(withoutKey(reference, document)))
  return { reference: { collection: reference, id }, data: withKey(reference, id, document) } as never
}

const updateDocument: Adapter['updateDocument'] = async (reference, document) => {
  checkValues(document)
  const documents = documentsOf(reference.collection.name)
  const stored = documents.get(reference.id)
  if (stored === undefined) throw new DocumentNotFoundError(reference)
  if (document[reference.collection.primaryKey.key] !== undefined && document[reference.collection.primaryKey.key] !== reference.id) {
    throw new Error(`database/key-immutable: ${reference.collection.primaryKey.key}`)
  }
  documents.set(reference.id, { ...stored, ...structuredClone(withoutKey(reference.collection, document)) })
  return { reference, data: document } as never
}

const deleteDocument: Adapter['deleteDocument'] = async (reference) => {
  documentsOf(reference.collection.name).delete(reference.id)
}

/**
 * A database adapter to `contracts/database.md`, in memory, ordering documents by ID. A test mocks
 * `$lib/script/database/providers.server` so that `adapterForCollection` returns it.
 */
const memoryDatabase = {
  createDocument,
  getCollection,
  getDocument,
  updateDocument,
  deleteDocument,
  clear (): void {
    collections.clear()
  },
  /** Arranges a stored document; `data` is stored as given, without a key field. */
  set (collection: string, id: string, data: Data): void {
    documentsOf(collection).set(id, structuredClone(data))
  },
  /** The stored document, without a key field, or `undefined`. */
  get (collection: string, id: string): Data | undefined {
    const stored = documentsOf(collection).get(id)
    return stored === undefined ? undefined : structuredClone(stored)
  },
  /** The IDs stored in a collection, in order. */
  ids (collection: string): string[] {
    return idsInOrder(collection)
  }
}

/** The part of `providers.server` that a test replaces. */
const memoryDatabaseProviders = {
  adapterForCollection: async (): Promise<Adapter> => memoryDatabase,
  adapterForDatabase: async (): Promise<Adapter> => memoryDatabase
}

export { memoryDatabase, memoryDatabaseProviders }
