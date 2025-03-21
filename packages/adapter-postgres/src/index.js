import { config, getProvider } from '@genoacms/cloudabstraction'
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

async function testConnection () {
  const test = await sql('Test').select('*')
  console.log(test)
}

/**
  * @type {Adapter['createDocument']}
  */
const createDocument = async function (reference, document) {
  const tableName = reference?.name
  if (!tableName) throw new Error('Missing table name when inserting a document')
  if (!document) throw new Error(`Inserting empty document to ${tableName}`)
  await sql(tableName).insert(document)
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
  return document
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
// console.log(config.database)
const collection = config.database.databases[0].collections[0]
const testDocument = {
  id: crypto.randomUUID(),
  name: 'test',
  description: 'desc',
  sections: []
}
console.log(collection)

// console.log(sql)
// testConnection()
// createDocument(collection, testDocument)
// getCollection(collection)
// console.log(await getDocument({ id: 'ee1b6b2e-97d2-4d65-8c55-583221c56b1d', collection }))
// await updateDocument({ id: 'ee1b6b2e-97d2-4d65-8c55-583221c56b1d', collection }, {
//  id: 'ee1b6b2e-97d2-4d65-8c55-583221c56b1d',
//  name: 'test',
//  description: 'desc but changed',
//  sections: []
// })
console.log(await deleteDocument({ id: 'f3aac7ef-776c-4e28-8a48-6ddfeccd3677', collection }))

export {
  createDocument,
  getCollection,
  getDocument,
  updateDocument,
  deleteDocument
}
