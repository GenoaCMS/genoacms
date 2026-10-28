import {
  DocumentNotFoundError,
  UnsupportedQueryError,
  type Adapter,
  type CollectionPage,
  type CollectionReference,
  type Condition,
  type Document,
  type QueryParams,
  type DocumentReference,
  type DocumentSnapshot,
  type UpdateSnapshot
} from '@genoacms/contracts/database'
import { checkQuery, checkValues, decodeToken, encodeToken, matches } from '@genoacms/contracts/database/query'
import { defineRuntime } from '@genoacms/contracts'
import { FieldPath, Firestore, type DocumentReference as FirestoreDocument, type Query } from '@google-cloud/firestore'
import type { GcpDatabaseOptions } from './descriptor.js'

const FAILED_PRECONDITION = 9
const NOT_FOUND = 5

interface PageCursor {
  values: unknown[]
  id: string
}

interface FetchedDocument {
  id: string
  data: () => Record<string, unknown>
}

// DATA-2
const asJson = <T>(data: T): T => JSON.parse(JSON.stringify(data))

// DATA-3
const withKey = (collection: CollectionReference, id: string, data: Record<string, unknown>): Document<CollectionReference> => {
  const keyed = { ...data, [collection.primaryKey.key]: id }
  return keyed as Document<CollectionReference>
}

const snapshotOf = (collection: CollectionReference, document: FetchedDocument): DocumentSnapshot<CollectionReference> =>
  ({ reference: { collection, id: document.id }, data: withKey(collection, document.id, document.data()) })

const errorCode = (error: unknown): unknown => (error as { code?: unknown } | null)?.code

const isInequality = ({ operator }: Condition): boolean => operator !== '=='

// DATA-9
const matchesNothing = (collection: CollectionReference, conditions: Condition[]): boolean =>
  conditions.some(({ field, operator, value }) =>
    (field === collection.primaryKey.key && typeof value !== 'string') || (value === null && operator !== '=='))

const fieldPathOf = (collection: CollectionReference, field: string): FieldPath =>
  field === collection.primaryKey.key ? FieldPath.documentId() : new FieldPath(field)

// DB-5
const inequalityFields = (collection: CollectionReference, conditions: Condition[]): string[] =>
  [...new Set(conditions.filter(isInequality).map(({ field }) => field))]
    .filter(field => field !== collection.primaryKey.key)
    .sort()

const filteredQuery = (query: Query, collection: CollectionReference, conditions: Condition[]): Query =>
  conditions.reduce<Query>((filtered, { field, operator, value }) => filtered.where(fieldPathOf(collection, field), operator, value), query)

const orderedQuery = (query: Query, fields: string[]): Query =>
  [...fields.map(field => new FieldPath(field)), FieldPath.documentId()].reduce<Query>((ordered, field) => ordered.orderBy(field), query)

const cursorAfter = (fields: string[], document: FetchedDocument, collection: CollectionReference): PageCursor => {
  const data = withKey(collection, document.id, document.data()) as Record<string, unknown>
  return { values: fields.map(field => data[field]), id: document.id }
}

interface Scan {
  base: Query
  collection: CollectionReference
  conditions: Condition[]
  fields: string[]
  limit: number | undefined
}

const batchQuery = ({ base, limit }: Scan, token: string | undefined): Query => {
  const resumed = token === undefined ? base : base.startAfter(...cursorValues(token))
  return limit === undefined ? resumed : resumed.limit(limit)
}

async function fetchBatch (query: Query): Promise<FetchedDocument[]> {
  const fetched: FetchedDocument[] = []
  const result = await query.get().catch(refuseUnservableQuery)
  result.forEach(document => { fetched.push(document as unknown as FetchedDocument) })
  return fetched
}

// DATA-11
function refuseUnservableQuery (error: unknown): never {
  if (errorCode(error) === FAILED_PRECONDITION && /index/i.test((error as Error).message)) throw new UnsupportedQueryError((error as Error).message)
  throw error
}

// DATA-8
function cursorValues (token: string): unknown[] {
  const cursor = decodeToken(token) as Partial<PageCursor> | null
  if (typeof cursor?.id !== 'string' || !Array.isArray(cursor.values)) throw new Error('database/invalid-query: unknown page token')
  return [...cursor.values, cursor.id]
}

// DATA-10
function pageAtLimit (scan: Scan, batch: FetchedDocument[], documents: Array<DocumentSnapshot<CollectionReference>>): CollectionPage<CollectionReference> | undefined {
  for (const [index, document] of batch.entries()) {
    const snapshot = snapshotOf(scan.collection, document)
    if (!matches(snapshot.data, scan.conditions)) continue
    documents.push(snapshot)
    if (documents.length !== scan.limit) continue
    const queryMayHaveMore = index < batch.length - 1 || batch.length === scan.limit
    return queryMayHaveMore ? { documents, next: encodeToken(cursorAfter(scan.fields, document, scan.collection)) } : { documents }
  }
  return undefined
}

// DATA-10
async function pageOf (scan: Scan, firstToken: string | undefined): Promise<CollectionPage<CollectionReference>> {
  const documents: Array<DocumentSnapshot<CollectionReference>> = []
  let token = firstToken
  for (;;) {
    const batch = await fetchBatch(batchQuery(scan, token))
    const page = pageAtLimit(scan, batch, documents)
    if (page !== undefined) return page
    if (scan.limit === undefined || batch.length < scan.limit) return { documents }
    token = encodeToken(cursorAfter(scan.fields, batch[batch.length - 1], scan.collection))
  }
}

async function requireExisting (document: FirestoreDocument, reference: DocumentReference<CollectionReference>): Promise<void> {
  if (!(await document.get()).exists) throw new DocumentNotFoundError(reference)
}

// DATA-3, DATA-6
function updateArguments (reference: DocumentReference<CollectionReference>, data: Record<string, unknown>): unknown[] {
  const key = reference.collection.primaryKey.key
  if (Object.hasOwn(data, key) && data[key] !== reference.id) throw new Error(`database/key-immutable: ${key}`)
  return Object.entries(data)
    .filter(([field, value]) => field !== key && value !== undefined)
    .flatMap(([field, value]) => [new FieldPath(field), asJson(value)])
}

/** One Firestore provider, with its own client and credential. */
export default defineRuntime<GcpDatabaseOptions, Adapter>({
  create ({ projectId, databaseId, credentials }): Adapter {
    const firestore = new Firestore({
      projectId,
      databaseId: databaseId ?? '(default)',
      ...(credentials === undefined ? {} : { credentials })
    })

    const createDocument = async (reference: CollectionReference, data: Record<string, unknown>): Promise<DocumentSnapshot<CollectionReference>> => {
      checkValues(data)
      const document = firestore.collection(reference.name).doc()
      const stored = withKey(reference, document.id, data)
      await document.set(asJson(stored))
      const documentReference: DocumentReference<typeof reference> = {
        collection: reference,
        id: document.id
      }
      return {
        reference: documentReference,
        data: stored
      }
    }

    const getCollection = async (reference: CollectionReference, params: QueryParams = {}): Promise<CollectionPage<CollectionReference>> => {
      checkQuery(params)
      const conditions = params.where ?? []
      const fields = inequalityFields(reference, conditions)
      const firstToken = params.pageToken
      if (firstToken !== undefined) cursorValues(firstToken)
      if (matchesNothing(reference, conditions)) return { documents: [] }
      const base = orderedQuery(filteredQuery(firestore.collection(reference.name), reference, conditions), fields)
      return await pageOf({ base, collection: reference, conditions, fields, limit: params.limit }, firstToken)
    }

    const getDocument = async ({ collection, id }: DocumentReference<CollectionReference>): Promise<DocumentSnapshot<CollectionReference> | undefined> => {
      const document = await firestore.collection(collection.name).doc(id).get()
      if (!document.exists) return undefined
      return { reference: { collection, id }, data: withKey(collection, id, document.data() as Record<string, unknown>) }
    }

    const updateDocument = async (reference: DocumentReference<CollectionReference>, data: Record<string, unknown>): Promise<UpdateSnapshot<CollectionReference>> => {
      checkValues(data)
      const [field, value, ...rest] = updateArguments(reference, data)
      const document = firestore.collection(reference.collection.name).doc(reference.id)
      try {
        if (field === undefined) await requireExisting(document, reference)
        else await document.update(field as FieldPath, value, ...rest)
      } catch (error) {
        if (errorCode(error) === NOT_FOUND) throw new DocumentNotFoundError(reference)
        throw error
      }
      const snapshot = { reference, data }
      return snapshot as UpdateSnapshot<CollectionReference>
    }

    const deleteDocument = async (reference: DocumentReference<CollectionReference>): Promise<void> => {
      await firestore.collection(reference.collection.name).doc(reference.id).delete()
    }

    return {
      createDocument,
      getDocument,
      getCollection,
      updateDocument,
      deleteDocument
    } as unknown as Adapter
  }
})
