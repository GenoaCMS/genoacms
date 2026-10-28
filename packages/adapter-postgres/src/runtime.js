import knex from 'knex'
import { randomUUID } from 'node:crypto'
import { defineRuntime } from '@genoacms/contracts'
import { DocumentNotFoundError } from '@genoacms/contracts/database'
import { checkQuery, checkValues, decodeToken, encodeToken } from '@genoacms/contracts/database/query'
/**
 * @import {Adapter, CollectionReference, Condition, DocumentReference} from '@genoacms/contracts/database'
 */

const JSON_TYPES = { string: 'string', number: 'number', boolean: 'boolean' }
const CASTS = { string: '', number: '::numeric', boolean: '::boolean' }

/**
 * Drops keys whose value is `undefined`, so the pg driver's own defaults apply.
 *
 * @param {Record<string, unknown>} options
 */
const withoutUndefined = (options) => Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined))

/**
 * @param {unknown} value
 * @returns {unknown}
 */
const asColumnValue = (value) => (Array.isArray(value) || (typeof value === 'object' && value !== null)) ? JSON.stringify(value) : value

/**
 * DATA-2, DATA-3
 *
 * @param {CollectionReference} collection
 * @param {Record<string, unknown>} document
 * @returns {Record<string, unknown>}
 */
const columnsOf = (collection, document) => Object.fromEntries(
  Object.entries(document)
    .filter(([field, value]) => field !== collection.primaryKey.key && value !== undefined)
    .map(([field, value]) => [field, asColumnValue(value)])
)

/**
 * DATA-3
 *
 * @param {CollectionReference} collection
 * @param {Record<string, unknown>} row
 */
const snapshotOf = (collection, row) => {
  const id = String(row[collection.primaryKey.key])
  return { reference: { collection, id }, data: { ...row, [collection.primaryKey.key]: id } }
}

/**
 * DATA-9: the value of a column as the JSON type it holds, or NULL.
 *
 * @param {'string' | 'number' | 'boolean'} type
 * @returns {string}
 */
const typedValue = (type) =>
  `(CASE WHEN jsonb_typeof(to_jsonb(??)) = '${JSON_TYPES[type]}' THEN (to_jsonb(??) #>> '{}')${CASTS[type]} END)${type === 'string' ? ' COLLATE "C"' : ''}`

/**
 * DATA-9
 *
 * @param {import('knex').Knex.QueryBuilder} query
 * @param {CollectionReference} collection
 * @param {Condition} condition
 */
const whereCondition = (query, collection, { field, operator, value }) => {
  if (value === null) return operator === '==' ? query.whereNull(field) : query.whereRaw('false')
  if (field === collection.primaryKey.key) {
    return typeof value === 'string' ? query.whereRaw(`??::text COLLATE "C" ${operator === '==' ? '=' : operator} ?`, [field, value]) : query.whereRaw('false')
  }
  const sqlOperator = operator === '==' ? '=' : operator
  const type = /** @type {'string' | 'number' | 'boolean'} */ (typeof value)
  return query.whereRaw(`${typedValue(type)} ${sqlOperator} ?`, [field, field, value])
}

/**
 * DATA-10
 *
 * @param {import('knex').Knex.QueryBuilder} query
 * @param {CollectionReference} collection
 * @param {string | undefined} pageToken
 */
const startingAfter = (query, collection, pageToken) => {
  if (pageToken === undefined) return query
  const lastKey = decodeToken(pageToken)
  if (typeof lastKey !== 'string') throw new Error('database/invalid-query: unknown page token')
  return query.where(collection.primaryKey.key, '>', lastKey)
}

/** One Postgres provider, with its own connection pool. */
export default defineRuntime({
  create ({ host, port, database, user, password }) {
    const sql = knex({ client: 'pg', connection: withoutUndefined({ host, port, database, user, password }) })

    /**
      * @type {Adapter['createDocument']}
      */
    const createDocument = async function (reference, document) {
      const tableName = reference?.name
      const primaryKeyProperty = reference?.primaryKey?.key
      if (!tableName) throw new Error('Missing table name when inserting a document')
      if (!document) throw new Error(`Inserting empty document to ${tableName}`)
      if (!primaryKeyProperty) throw new Error(`Missing primaryKey of ${tableName}`)
      checkValues(document)

      const generatedKey = reference.primaryKey.schema?.type === 'string' ? { [primaryKeyProperty]: randomUUID() } : {}
      const [row] = await sql(tableName).insert({ ...columnsOf(reference, document), ...generatedKey }).returning('*')
      const id = String(row[primaryKeyProperty])

      return {
        reference: { collection: reference, id },
        data: { ...document, [primaryKeyProperty]: id }
      }
    }

    /**
      * @type {Adapter['getCollection']}
      */
    const getCollection = async function (reference, queryParams = {}) {
      const tableName = reference?.name
      const primaryKeyProperty = reference?.primaryKey?.key
      if (!tableName) throw new Error('Missing table name when listing collection')
      if (!primaryKeyProperty) throw new Error(`Missing primaryKey of ${tableName}`)
      checkQuery(queryParams)

      const { where = [], limit, pageToken } = queryParams
      let query = sql(tableName).select('*').orderBy(primaryKeyProperty)
      for (const condition of where) query = whereCondition(query, reference, condition)
      query = startingAfter(query, reference, pageToken)
      if (limit !== undefined) query = query.limit(limit)

      const documents = (await query).map(row => snapshotOf(reference, row))
      const full = limit !== undefined && documents.length === limit
      return full ? { documents, next: encodeToken(documents[documents.length - 1].reference.id) } : { documents }
    }

    /**
      * @type {Adapter['getDocument']}
      */
    const getDocument = async function (reference) {
      const tableName = reference?.collection?.name
      const primaryKeyProperty = reference?.collection?.primaryKey?.key
      const primaryKeyValue = reference?.id
      if (!tableName) throw new Error(`Missing table name in reference ${reference?.id}`)
      if (!primaryKeyProperty) throw new Error(`Missing primaryKey of ${tableName}`)
      if (!primaryKeyValue) throw new Error(`Missing id of queried document from ${tableName}`)

      const row = await sql(tableName)
        .select('*')
        .where(primaryKeyProperty, primaryKeyValue)
        .first()
      return row === undefined ? undefined : snapshotOf(reference.collection, row)
    }

    /**
      * @type {Adapter['updateDocument']}
      */
    const updateDocument = async function (reference, document) {
      const tableName = reference?.collection?.name
      const primaryKeyProperty = reference?.collection?.primaryKey?.key
      const primaryKeyValue = reference?.id
      if (!tableName) throw new Error(`Missing table name in reference ${reference?.id}`)
      if (!primaryKeyProperty) throw new Error(`Missing primaryKey of ${tableName}`)
      if (!primaryKeyValue) throw new Error(`Missing id of updated document from ${tableName}`)
      if (!document) throw new Error(`Updating empty document to ${tableName}`)
      if (Object.hasOwn(document, primaryKeyProperty) && document[primaryKeyProperty] !== primaryKeyValue) throw new Error(`database/key-immutable: ${primaryKeyProperty}`)
      checkValues(document)

      const columns = columnsOf(reference.collection, document)
      const matching = sql(tableName).where(primaryKeyProperty, primaryKeyValue)
      const found = Object.keys(columns).length === 0
        ? await matching.select(primaryKeyProperty)
        : await matching.update(columns).returning(primaryKeyProperty)
      if (found.length === 0) throw new DocumentNotFoundError(reference)

      return {
        reference,
        data: document
      }
    }

    /**
      * @type {Adapter['deleteDocument']}
      */
    const deleteDocument = async function (reference) {
      const tableName = reference?.collection?.name
      const primaryKeyProperty = reference?.collection?.primaryKey?.key
      const primaryKeyValue = reference?.id
      if (!tableName) throw new Error(`Missing table name in reference ${reference?.id}`)
      if (!primaryKeyProperty) throw new Error(`Missing primaryKey of ${tableName}`)
      if (!primaryKeyValue) throw new Error(`Missing id of deleted document from ${tableName}`)

      await sql(tableName).delete().where(primaryKeyProperty, primaryKeyValue)
    }

    return {
      createDocument,
      getCollection,
      getDocument,
      updateDocument,
      deleteDocument
    }
  }
})
