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
  await sql(reference.name).insert(document)
  console.log('inserted')
}

/**
  * @type {Adapter['getCollection']}
  */
const getCollection = async function (reference, queryParams = {}) {
  const rows = await sql(reference.name).select('*')
  console.log(rows)
  return rows
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
getCollection(collection)

export {
  createDocument,
  getCollection
}
