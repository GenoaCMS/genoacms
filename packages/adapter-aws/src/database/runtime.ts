import type { Adapter, CollectionReference, DocumentReference } from '@genoacms/contracts/database'
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
  type AttributeValue
} from '@aws-sdk/client-dynamodb'
import { randomUUID } from 'node:crypto'
import { defineRuntime } from '@genoacms/contracts'
import { clientConfig, type AwsCredentials } from '../shared.js'
import type { AwsDatabaseOptions } from './descriptor.js'
import { fromItem, toAttribute, toItem, type Item } from './values.js'

// DDB-2
function requireStringKey (collection: CollectionReference): void {
  if (collection.primaryKey.schema?.type !== 'string') throw new Error(`database/unsupported-key-type: ${collection.name}`)
}

const keyNames = (collection: CollectionReference): Record<string, string> => ({ '#key': collection.primaryKey.key })

const keyOf = (collection: CollectionReference, id: string): Item => ({ [collection.primaryKey.key]: { S: id } })

function withoutKey (collection: CollectionReference, item: Item): { id: string, data: Record<string, unknown> } {
  const { [collection.primaryKey.key]: key, ...rest } = item
  return { id: key?.S as string, data: fromItem(rest) }
}

function updateExpression (data: Record<string, unknown>): { UpdateExpression: string, ExpressionAttributeNames: Record<string, string>, ExpressionAttributeValues: Record<string, AttributeValue> } | undefined {
  const fields = Object.entries(data).filter(([, value]) => value !== undefined)
  if (fields.length === 0) return undefined
  const ExpressionAttributeNames: Record<string, string> = {}
  const ExpressionAttributeValues: Record<string, AttributeValue> = {}
  const assignments = fields.map(([field, value], index) => {
    ExpressionAttributeNames[`#f${index}`] = field
    ExpressionAttributeValues[`:v${index}`] = toAttribute(value, field)
    return `#f${index} = :v${index}`
  })
  return { UpdateExpression: `SET ${assignments.join(', ')}`, ExpressionAttributeNames, ExpressionAttributeValues }
}

export default defineRuntime<AwsDatabaseOptions, Adapter>({
  create ({ region, credentials }): Adapter {
    const client = new DynamoDBClient(clientConfig(region, credentials as AwsCredentials | undefined))

    // DDB-4
    const createDocument = async (collection: CollectionReference, data: Record<string, unknown>): Promise<unknown> => {
      requireStringKey(collection)
      const id = randomUUID()
      await client.send(new PutItemCommand({
        TableName: collection.name,
        Item: { ...toItem(data), ...keyOf(collection, id) },
        ConditionExpression: 'attribute_not_exists(#key)',
        ExpressionAttributeNames: keyNames(collection)
      }))
      return { reference: { collection, id }, data }
    }

    // DDB-5
    const getCollection = async (collection: CollectionReference): Promise<unknown> => {
      requireStringKey(collection)
      const snapshots = []
      let ExclusiveStartKey: Item | undefined
      do {
        const page = await client.send(new ScanCommand({ TableName: collection.name, ConsistentRead: true, ExclusiveStartKey }))
        for (const item of page.Items ?? []) {
          const { id, data } = withoutKey(collection, item)
          snapshots.push({ reference: { collection, id }, data })
        }
        ExclusiveStartKey = page.LastEvaluatedKey
      } while (ExclusiveStartKey !== undefined)
      return snapshots
    }

    // DDB-6
    const getDocument = async ({ collection, id }: DocumentReference<CollectionReference>): Promise<unknown> => {
      requireStringKey(collection)
      const response = await client.send(new GetItemCommand({ TableName: collection.name, Key: keyOf(collection, id), ConsistentRead: true }))
      if (response.Item === undefined) return undefined
      return { reference: { collection, id }, data: withoutKey(collection, response.Item).data }
    }

    // DDB-7
    const updateDocument = async (reference: DocumentReference<CollectionReference>, data: Record<string, unknown>): Promise<unknown> => {
      const { collection, id } = reference
      requireStringKey(collection)
      const key = collection.primaryKey.key
      if (key in data) throw new Error(`database/key-immutable: ${key}`)
      const expression = updateExpression(data)
      if (expression === undefined) return { reference, data }
      await client.send(new UpdateItemCommand({
        TableName: collection.name,
        Key: keyOf(collection, id),
        UpdateExpression: expression.UpdateExpression,
        ConditionExpression: 'attribute_exists(#key)',
        ExpressionAttributeNames: { ...expression.ExpressionAttributeNames, ...keyNames(collection) },
        ExpressionAttributeValues: expression.ExpressionAttributeValues
      }))
      return { reference, data }
    }

    // DDB-7
    const deleteDocument = async ({ collection, id }: DocumentReference<CollectionReference>): Promise<void> => {
      requireStringKey(collection)
      await client.send(new DeleteItemCommand({ TableName: collection.name, Key: keyOf(collection, id) }))
    }

    return { createDocument, getCollection, getDocument, updateDocument, deleteDocument } as unknown as Adapter
  }
})
