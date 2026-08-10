import { config } from '@genoacms/cloudabstraction'
import type { Adapter } from '@genoacms/cloudabstraction/database'

const databaseConfigs = config.database.databases || []

function getCollections () {
  const collections = []
  for (const database of databaseConfigs) {
    collections.push(...database.collections)
  }
  return collections
}
function getDatabaseNames () {
  return databaseConfigs.map(database => database.name)
}

function getProviderNameByDatabaseName (databaseName: string) {
  const database = databaseConfigs.find(database => database.name === databaseName)
  if (!database) throw new Error('database/not-found')
  return database.providerName
}

async function getAdapterByProviderName (providerName: string): Promise<Adapter> {
  const provider = config.database.providers.find(provider => provider.name === providerName)
  if (!provider) throw new Error('provider/not-found')
  return await provider.adapter
}

function getDatabaseNameByCollectionName (collectionName: string) {
  const database = databaseConfigs.find(database => {
    return database.collections.some(collection => collection.name === collectionName)
  })
  if (!database) throw new Error('database/not-found')
  return database.name
}

async function getAdapterByCollectionName (collectionName: string): Promise<Adapter> {
  const databaseName = getDatabaseNameByCollectionName(collectionName)
  const providerName = getProviderNameByDatabaseName(databaseName)
  return await getAdapterByProviderName(providerName)
}

const createDocument: Adapter['createDocument'] = async (reference, document) => {
  const adapter = await getAdapterByCollectionName(reference.name)
  return await adapter.createDocument(reference, document)
}

const getCollection: Adapter['getCollection'] = async (reference, queryParams) => {
  const adapter = await getAdapterByCollectionName(reference.name)
  return await adapter.getCollection(reference, queryParams)
}

const getDocument: Adapter['getDocument'] = async (reference) => {
  const adapter = await getAdapterByCollectionName(reference.collection.name)
  return await adapter.getDocument(reference)
}

const updateDocument: Adapter['updateDocument'] = async (reference, document) => {
  const adapter = await getAdapterByCollectionName(reference.collection.name)
  return await adapter.updateDocument(reference, document)
}

const deleteDocument: Adapter['deleteDocument'] = async (reference) => {
  const adapter = await getAdapterByCollectionName(reference.collection.name)
  return await adapter.deleteDocument(reference)
}

export {
  getCollections,
  getDatabaseNames,
  createDocument,
  getCollection,
  getDocument,
  updateDocument,
  deleteDocument
}
