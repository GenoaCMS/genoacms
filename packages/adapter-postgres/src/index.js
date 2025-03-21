import { getProvider } from '@genoacms/cloudabstraction'
import knex from 'knex'
/**
 * @import {Adapter} from '@genoacms/cloudabstraction/database'
 */

const ADAPTER_NAME = '@genoacms/adapter-postgres'
const provider = getProvider('database', ADAPTER_NAME)
const sql = knex({
  client: 'pg',
  connection: { user: provider.config.username, ...provider.config }
})

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
  if (!tableName) throw new Error('Missing table name when listing collection')
  const rows = await sql(tableName).select('*')
  return rows
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

export {
  createDocument,
  getCollection,
  getDocument,
  updateDocument,
  deleteDocument
}
