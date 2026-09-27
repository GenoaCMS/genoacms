import { host } from '$lib/script/host.server'
import type { Adapter } from '@genoacms/contracts/database'

function getCollections () {
  return [...host.collections]
}
function getDatabaseNames () {
  return [...host.databases]
}

const createDocument: Adapter['createDocument'] = async (reference, document) => {
  const adapter = await host.databaseForCollection(reference.name)
  return await adapter.createDocument(reference, document)
}

const getCollection: Adapter['getCollection'] = async (reference, queryParams) => {
  const adapter = await host.databaseForCollection(reference.name)
  return await adapter.getCollection(reference, queryParams)
}

const getDocument: Adapter['getDocument'] = async (reference) => {
  const adapter = await host.databaseForCollection(reference.collection.name)
  return await adapter.getDocument(reference)
}

const updateDocument: Adapter['updateDocument'] = async (reference, document) => {
  const adapter = await host.databaseForCollection(reference.collection.name)
  return await adapter.updateDocument(reference, document)
}

const deleteDocument: Adapter['deleteDocument'] = async (reference) => {
  const adapter = await host.databaseForCollection(reference.collection.name)
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
