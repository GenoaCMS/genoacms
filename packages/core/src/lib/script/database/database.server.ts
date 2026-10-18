import { building } from '$app/environment'
import type { Adapter, CollectionReference } from '@genoacms/contracts/database'
import type { DocumentType } from '$lib/script/signing/envelope'
import type { JsonValue } from '$lib/script/signing/canonical'
import { readSignedDocument } from '$lib/script/signing/signedDocument.server'
import { isNotFound } from '@genoacms/contracts/storage'
import { defaultBucketId, fullyQualifiedNameToFilename, getObjectJSON, listWholeDirectory } from '../storage/storage.server'
import { getCollections, getDatabaseNames, adapterForCollection, adapterForDatabase } from './providers.server'

const COLLECTION_DEFINITION_DOCUMENT: DocumentType = 'genoacms.collectionDefinition.v1'

const collectionsDirectoryOf = (database: string): string => `.genoacms/databases/${database}/collections/`
const definitionPath = (database: string, name: string): string => `${collectionsDirectoryOf(database)}${name}`

const configuredCollections = getCollections()
const isConfigured = (name: string): boolean => configuredCollections.some(collection => collection.name === name)

// COL-1, OD12
async function listDynamicCollections (): Promise<Map<string, string>> {
  const listings = await Promise.all(getDatabaseNames().map(async database => ({
    database,
    contents: await listWholeDirectory({ name: collectionsDirectoryOf(database), bucket: defaultBucketId })
  })))
  const dynamic = new Map<string, string>()
  for (const { database, contents } of listings) {
    for (const file of contents.files) {
      const name = fullyQualifiedNameToFilename(file.name)
      if (!isConfigured(name) && !dynamic.has(name)) dynamic.set(name, database)
    }
  }
  return dynamic
}
// COL-1
const dynamicCollections = building ? new Map<string, string>() : await listDynamicCollections()

function getCollectionReferences (): string[] {
  return [...configuredCollections.map(collection => collection.name), ...dynamicCollections.keys()]
}

// COL-2
async function getCollectionReference (name: string): Promise<CollectionReference> {
  const configured = configuredCollections.find(collection => collection.name === name)
  if (configured !== undefined) return configured
  const database = dynamicCollections.get(name)
  if (database === undefined) throw new Error('collection/not-found')
  return await readDefinition(database, name)
}

// COL-2, OD13
async function readDefinition (database: string, name: string): Promise<CollectionReference> {
  const candidate: unknown = await getObjectJSON({ name: definitionPath(database, name), bucket: defaultBucketId })
    .catch((error: unknown) => { throw isNotFound(error) || error instanceof SyntaxError ? new Error('collection/not-found') : error })
  const verified = await readSignedDocument(candidate, COLLECTION_DEFINITION_DOCUMENT)
  if (!verified.ok) throw unverifiable(name, verified.reason)
  return definitionOf(verified.payload, database, name)
}

const PAYLOAD_FIELDS = ['database', 'definition']

// COL-7, OF22
function definitionOf (payload: JsonValue, database: string, name: string): CollectionReference {
  if (!isJsonObject(payload) || !hasExactly(payload, PAYLOAD_FIELDS)) throw unverifiable(name, 'not a definition payload')
  if (payload.database !== database) throw unverifiable(name, `not signed for the database ${database}`)
  const definition = payload.definition
  if (!isJsonObject(definition) || definition.name !== name) throw unverifiable(name, `not signed for the name ${name}`)
  return definition as unknown as CollectionReference
}

const unverifiable = (name: string, reason: string): Error =>
  new Error(`collection/unverifiable: the definition of '${name}' did not verify (${reason})`)

const isJsonObject = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasExactly = (object: Record<string, JsonValue>, fields: string[]): boolean =>
  Object.keys(object).length === fields.length && fields.every(field => Object.hasOwn(object, field))

// COL-6
async function adapterOf (collection: string): Promise<Adapter> {
  const database = dynamicCollections.get(collection)
  return database === undefined ? await adapterForCollection(collection) : await adapterForDatabase(database)
}

const createDocument: Adapter['createDocument'] = async (reference, document) =>
  await (await adapterOf(reference.name)).createDocument(reference, document)

const getCollection: Adapter['getCollection'] = async (reference, queryParams) =>
  await (await adapterOf(reference.name)).getCollection(reference, queryParams)

const getDocument: Adapter['getDocument'] = async (reference) =>
  await (await adapterOf(reference.collection.name)).getDocument(reference)

const updateDocument: Adapter['updateDocument'] = async (reference, document) =>
  await (await adapterOf(reference.collection.name)).updateDocument(reference, document)

const deleteDocument: Adapter['deleteDocument'] = async (reference) =>
  await (await adapterOf(reference.collection.name)).deleteDocument(reference)

export {
  getCollectionReferences,
  getCollectionReference,
  createDocument,
  getCollection,
  getDocument,
  updateDocument,
  deleteDocument
}
