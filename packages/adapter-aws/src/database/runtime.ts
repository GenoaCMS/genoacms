import type { Adapter, CollectionReference } from '@genoacms/contracts/database'
import {
  GetItemCommand,
  DynamoDBClient,
  PutItemCommand,
  DeleteItemCommand,
  ScanCommand,
  type AttributeValue
} from '@aws-sdk/client-dynamodb'
import { randomUUID } from 'node:crypto'
import { defineRuntime } from '@genoacms/contracts'
import { clientConfig } from '../shared.js'
import type { AwsDatabaseOptions } from './descriptor.js'

type Item = Record<string, AttributeValue>

function documentToDynamoItem (document: Record<string, unknown>): Item {
  const item: Item = {}
  for (const [key, value] of Object.entries(document)) item[key] = convertToDynamoAttribute(value)
  return item
}

function convertToDynamoAttribute (value: unknown): AttributeValue {
  switch (typeof value) {
    case 'string':
      return { S: value }
    case 'number':
      return { N: value.toString() }
    case 'boolean':
      return { BOOL: value }
    case 'object':
      if (Array.isArray(value)) return { L: value.map(convertToDynamoAttribute) }
      if (value === null) return { NULL: true }
      return { M: documentToDynamoItem(value as Record<string, unknown>) }
    default:
      throw new Error('unsupported-type')
  }
}

function dynamoItemToObject (item: Item): Record<string, unknown> {
  const document: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(item)) document[key] = dynamoAttributeToObject(value)
  return document
}

function dynamoAttributeToObject (value: AttributeValue): unknown {
  const typeKey = Object.keys(value)[0]
  switch (typeKey) {
    case 'S':
      return value.S
    case 'N':
      return Number(value.N)
    case 'BOOL':
      return value.BOOL
    case 'L':
      return value.L?.map(dynamoAttributeToObject)
    case 'M':
      return dynamoItemToObject(value.M as Item)
    case 'NULL':
      return null
    default:
      throw new Error('unsupported-type')
  }
}

export default defineRuntime<AwsDatabaseOptions, Adapter>({
  create ({ region, credentials }): Adapter {
    const client = new DynamoDBClient(clientConfig(region, credentials as never))

    const generateID = ({ primaryKey }: CollectionReference): Record<string, string> => ({ [primaryKey.key]: randomUUID() })

    const createDocument = async (collection: CollectionReference, document: Record<string, unknown>): Promise<any> => {
      const documentToCreate = { ...generateID(collection), ...document }
      const command = new PutItemCommand({ TableName: collection.name, Item: documentToDynamoItem(documentToCreate) })
      try {
        await client.send(command)
        return { reference: { collection, id: documentToCreate[collection.primaryKey.key] }, data: document }
      } catch {
        throw new Error('document-creation-failed')
      }
    }

    const getCollection = async (reference: CollectionReference): Promise<any> => {
      const command = new ScanCommand({ TableName: reference.name })
      try {
        const response = await client.send(command)
        return (response.Items ?? []).map(document => {
          const key = document[reference.primaryKey.key]
          const id = reference.primaryKey.schema.type === 'string' ? key.S : key.N
          return { reference: { collection: reference, id }, data: dynamoItemToObject(document) }
        })
      } catch {
        throw new Error('collection-fetching-failed')
      }
    }

    const getDocument = async ({ collection, id }: { collection: CollectionReference, id: string }): Promise<any> => {
      const command = new GetItemCommand({ TableName: collection.name, Key: documentToDynamoItem({ [collection.primaryKey.key]: id }) })
      try {
        const response = await client.send(command)
        const object = dynamoItemToObject(response.Item as Item)
        delete object[collection.primaryKey.key]
        return { reference: { collection, id }, data: object }
      } catch {
        throw new Error('document-fetching-failed')
      }
    }

    const updateDocument = async (reference: { collection: CollectionReference, id: string }, document: Record<string, unknown>): Promise<any> => {
      const Key = documentToDynamoItem({ [reference.collection.primaryKey.key]: reference.id })
      const command = new PutItemCommand({ TableName: reference.collection.name, Item: { ...documentToDynamoItem(document), ...Key } })
      try {
        await client.send(command)
        return { reference, data: document }
      } catch {
        throw new Error('document-updating-failed')
      }
    }

    const deleteDocument = async ({ collection, id }: { collection: CollectionReference, id: string }): Promise<void> => {
      const command = new DeleteItemCommand({ TableName: collection.name, Key: documentToDynamoItem({ [collection.primaryKey.key]: id }) })
      try {
        await client.send(command)
      } catch {
        throw new Error('document-deletion-failed')
      }
    }

    return { createDocument, getCollection, getDocument, updateDocument, deleteDocument } as unknown as Adapter
  }
})
