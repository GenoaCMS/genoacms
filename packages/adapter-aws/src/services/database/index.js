import {
  GetItemCommand,
  DynamoDBClient,
  PutItemCommand,
  DeleteItemCommand,
  UpdateItemCommand,
  ScanCommand
} from '@aws-sdk/client-dynamodb'
import config from '../../config.js'
import 'dotenv/config'
import { v4 as uuid4 } from 'uuid'

const client = new DynamoDBClient({
  region: config.database.region,
  credentials: {
    accessKeyId: globalThis.process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: globalThis.process.env.AWS_SECRET_ACCESS_KEY
  }
})

/**
 * @param {import('@genoacms/cloudabstraction').database.Document} document
 * @returns {import('@aws-sdk/client-dynamodb').AttributeValueMap
 */
const documentToDynamoItem = (document) => {
  const item = {}
  for (const [key, value] of Object.entries(document)) {
    switch (typeof value) {
      case 'string':
        item[key] = { S: value }
        break
      case 'number':
        item[key] = { N: value.toString() }
        break
      case 'boolean':
        item[key] = { BOOL: value }
        break
      case 'object':
        if (Array.isArray(value)) {
          item[key] = { L: value.map((item) => documentToDynamoItem(item)) }
        } else {
          item[key] = { M: documentToDynamoItem(value) }
        }
        break
      default:
        throw new Error('unsupported-type')
    }
  }
  return item
}

/**
 * @param {import('@aws-sdk/client-dynamodb').AttributeValueMap} item
 * @returns {import('@genoacms/cloudabstraction').database.Document}
 */
const dynamoItemToObject = (item) => {
  const document = {}
  for (const [key, value] of Object.entries(item)) {
    switch (Object.keys(value)[0]) {
      case 'S':
        document[key] = value.S
        break
      case 'N':
        document[key] = Number(value.N)
        break
      case 'BOOL':
        document[key] = value.BOOL
        break
      case 'L':
        document[key] = value.L.map((item) => dynamoItemToObject(item))
        break
      case 'M':
        document[key] = dynamoItemToObject(value.M)
        break
      default:
        throw new Error('unsupported-type')
    }
  }
  return document
}

const generateID = ({ primaryKey }) => {
  return {
    [primaryKey]: uuid4()
  }
}

/**
 * @type {import('@genoacms/cloudabstraction').database.createDocument}
 */
const createDocument = async ({ name, primaryKey, schema }, document) => {
  const documentToCreate = {
    ...generateID({ primaryKey }),
    ...document
  }
  const Item = documentToDynamoItem(documentToCreate)
  const command = new PutItemCommand({
    TableName: name,
    Item
  })
  try {
    await client.send(command)
    return {
      id: documentToCreate[primaryKey],
      collection: {
        name,
        primaryKey,
        schema
      }
    }
  } catch (err) {
    throw new Error('document-creation-failed')
  }
}

/**
 * @type {import('@genoacms/cloudabstraction').database.getCollection}
 */
// const getCollection = async ({ name, schema }, queryParams) => {
const getCollection = async ({ name, schema }) => {
  // const { startAfterValue, limit, conditions } = queryParams
  const command = new ScanCommand({
    TableName: name
  })
  try {
    const response = await client.send(command)
    const documents = response.Items.map(dynamoItemToObject)
    return documents
  } catch (err) {
    throw new Error('collection-fetching-failed')
  }
}

/**
 * @type {import('@genoacms/cloudabstraction').database.getDocument}
 */
const getDocument = async ({ collection, id }) => {
  const Key = documentToDynamoItem({
    [collection.primaryKey]: id
  })
  const command = new GetItemCommand({
    TableName: collection.name,
    Key
  })
  try {
    const response = await client.send(command)
    const object = dynamoItemToObject(response.Item)
    delete object[collection.primaryKey]
    return object
  } catch (err) {
    throw new Error('document-fetching-failed')
  }
}

/**
 * @type {import('@genoacms/cloudabstraction').database.updateDocument}
 */
const updateDocument = async (reference, document) => {
  const Item = documentToDynamoItem(document)
  const Key = documentToDynamoItem({
    [reference.collection.primaryKey]: reference.id
  })
  const command = new UpdateItemCommand({
    TableName: reference.collection.name,
    Item,
    Key
  })
  try {
    await client.send(command)
    return reference
  } catch (err) {
    throw new Error('document-updating-failed')
  }

}

/**
 * @type {import('@genoacms/cloudabstraction').database.deleteDocument}
 */
const deleteDocument = async ({ collection, id }) => {
  const Key = documentToDynamoItem({
    [collection.primaryKey]: id
  })
  const command = new DeleteItemCommand({
    TableName: collection.name,
    Key
  })
  try {
    await client.send(command)
  } catch (err) {
    throw new Error('document-deletion-failed')
  }
}

export {
  createDocument,
  getCollection,
  getDocument,
  updateDocument,
  deleteDocument
}
