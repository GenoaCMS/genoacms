import { host } from '#lib/script/host.server.js'
import type { Adapter } from '@genoacms/contracts/database'

function getCollections () {
  return [...host.collections]
}
function getDatabaseNames () {
  return [...host.databases]
}

const adapterForCollection = async (collection: string): Promise<Adapter> => await host.databaseForCollection(collection)
const adapterForDatabase = async (database: string): Promise<Adapter> => await host.databaseNamed(database)

export {
  getCollections,
  getDatabaseNames,
  adapterForCollection,
  adapterForDatabase
}
