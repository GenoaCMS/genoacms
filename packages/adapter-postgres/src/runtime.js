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
 * DATA-8: a field name taken literally, as SQL text for knex.raw.
 *
 * @param {string} name
 * @returns {string}
 */
const identifier = (name) => `"${name.replaceAll('"', '""')}"`.replaceAll('?', '\\?')

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
 * @param {Record<string, unknown>} document
 * @returns {Record<string, unknown>}
 */
const withoutKeyField = (collection, document) => {
  const { [collection.primaryKey.key]: _key, ...rest } = document
  return rest
}

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
 * @param {string} column
 * @returns {string}
 */
const typedValue = (type, column) =>
  `(CASE WHEN jsonb_typeof(to_jsonb(${column})) = '${JSON_TYPES[type]}' THEN (to_jsonb(${column}) #>> '{}')${CASTS[type]} END)${type === 'string' ? ' COLLATE "C"' : ''}`

/**
 * DATA-9
 *
 * @param {import('knex').Knex.QueryBuilder} query
 * @param {CollectionReference} collection
 * @param {Condition} condition
 */
const whereCondition = (query, collection, { field, operator, value }) => {
  if (value === null) return operator === '==' ? query.whereRaw(`${identifier(field)} IS NULL`) : query.whereRaw('false')
  if (field === collection.primaryKey.key) {
    return typeof value === 'string' ? query.whereRaw(`${identifier(field)}::text COLLATE "C" ${operator === '==' ? '=' : operator} ?`, [value]) : query.whereRaw('false')
  }
  const sqlOperator = operator === '==' ? '=' : operator
  const type = /** @type {'string' | 'number' | 'boolean'} */ (typeof value)
  return query.whereRaw(`${typedValue(type, identifier(field))} ${sqlOperator} ?`, [value])
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
  if (typeof lastKey !== 'string' && typeof lastKey !== 'number') throw new Error('database/invalid-query: unknown page token')
  return query.whereRaw(`${identifier(collection.primaryKey.key)} > ?`, [lastKey])
}

/**
 * DATA-9
 *
 * @param {string[]} columns
 * @param {Condition[]} conditions
 * @returns {boolean}
 */
const allHaveColumns = (columns, conditions) => conditions.every(({ field }) => columns.includes(field))

/** One Postgres provider, with its own connection pool. */
export default defineRuntime({
  create ({ host, port, database, user, password }) {
    const sql = knex({ client: 'pg', connection: withoutUndefined({ host, port, database, user, password }) })

    /** @type {Map<string, Promise<string[]>>} */
    const columnsByTable = new Map()
    const readColumns = async (/** @type {string} */ tableName) => {
      const rows = await sql('information_schema.columns').select('column_name').where({ table_name: tableName }).whereRaw('table_schema = current_schema()')
      return rows.map(row => row.column_name)
    }
    /** DATA-9 */
    const tableColumns = (/** @type {string} */ tableName) => {
      if (!columnsByTable.has(tableName)) columnsByTable.set(tableName, readColumns(tableName))
      return /** @type {Promise<string[]>} */ (columnsByTable.get(tableName))
    }

    /**
      * @type {Adapter['createDocument']}
      */
    const createDocument = async function (reference, document) {
      const tableName = reference?.name
      const primaryKeyProperty = reference?.primaryKey?.key
      if (!tableName) throw new Error('Missing table name when inserting a document')
      if (!document) throw new Error(`Inserting empty document to ${tableName}`)
      if (!primaryKeyProperty) throw new Error(`Missing primaryKey of ${tableName}`)
      checkValues(withoutKeyField(reference, document))

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
      if (pageToken !== undefined) startingAfter(sql(tableName), reference, pageToken)
      if (!allHaveColumns(await tableColumns(tableName), where)) return { documents: [] }
      let query = sql(tableName).select('*').orderByRaw(identifier(primaryKeyProperty))
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
      if (primaryKeyValue === '') return undefined
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
      if (document[primaryKeyProperty] !== undefined && document[primaryKeyProperty] !== primaryKeyValue) throw new Error(`database/key-immutable: ${primaryKeyProperty}`)
      checkValues(withoutKeyField(reference.collection, document))

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
      if (primaryKeyValue === '') return
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
