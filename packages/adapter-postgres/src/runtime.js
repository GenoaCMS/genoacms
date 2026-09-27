import knex from 'knex'
import { defineRuntime } from '@genoacms/contracts'
/**
 * @import {Adapter} from '@genoacms/contracts/database'
 */

/**
 * Drops keys whose value is `undefined`, so the pg driver's own defaults apply.
 *
 * @param {Record<string, unknown>} options
 */
const withoutUndefined = (options) => Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined))

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

      await sql(tableName).insert(document)

      const documentReference = {
        collection: reference,
        id: document[primaryKeyProperty]
      }

      return {
        reference: documentReference,
        data: document
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
      const rows = await sql(tableName).select('*')
      return rows.map(r => {
        return {
          reference: {
            collection: reference,
            id: r[reference.primaryKey.key]
          },
          data: r
        }
      })
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

      const document = await sql(tableName)
        .select('*')
        .where(primaryKeyProperty, primaryKeyValue)
        .first()
      return {
        reference,
        data: document
      }
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

      await sql(tableName).update(document).where(primaryKeyProperty, primaryKeyValue)

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
