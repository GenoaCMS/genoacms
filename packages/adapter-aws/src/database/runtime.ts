import {
  DocumentNotFoundError,
  type Adapter,
  type CollectionReference,
  type Condition,
  type DocumentReference,
  type DocumentSnapshot,
  type QueryParams
} from '@genoacms/contracts/database'
import { checkQuery, decodeToken, encodeToken } from '@genoacms/contracts/database/query'
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

function withoutKeyField (collection: CollectionReference, data: Record<string, unknown>): Record<string, unknown> {
  const { [collection.primaryKey.key]: _key, ...rest } = data
  return rest
}

function snapshotOf (collection: CollectionReference, item: Item): DocumentSnapshot<CollectionReference> {
  const data = fromItem(item) as DocumentSnapshot<CollectionReference>['data']
  return { reference: { collection, id: item[collection.primaryKey.key].S as string }, data }
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

// DATA-3
function withoutEqualKey (collection: CollectionReference, id: string, data: Record<string, unknown>): Record<string, unknown> {
  const key = collection.primaryKey.key
  if (!Object.hasOwn(data, key)) return data
  if (data[key] !== id) throw new Error(`database/key-immutable: ${key}`)
  return withoutKeyField(collection, data)
}

const isConditionFailure = (error: unknown): boolean => (error as { name?: unknown } | null)?.name === 'ConditionalCheckFailedException'

interface Filter {
  FilterExpression?: string
  ExpressionAttributeNames?: Record<string, string>
  ExpressionAttributeValues?: Record<string, AttributeValue>
}

interface Expression { expression: string, values: Record<string, AttributeValue> }

const NEVER = (name: string): string => `attribute_not_exists(${name}) AND attribute_exists(${name})`
const SQL_OPERATORS: Record<Condition['operator'], string> = { '==': '=', '!=': '<>', '<': '<', '<=': '<=', '>': '>', '>=': '>=' }
const ATTRIBUTE_TYPES = { string: 'S', number: 'N', boolean: 'BOOL', object: 'NULL' } as const

const ORDER_HOLDS: Record<Condition['operator'], (order: number) => boolean> = {
  '==': order => order === 0,
  '!=': order => order !== 0,
  '<': order => order < 0,
  '<=': order => order <= 0,
  '>': order => order > 0,
  '>=': order => order >= 0
}

const never = (name: string): Expression => ({ expression: NEVER(name), values: {} })

// DATA-9: DynamoDB does not order booleans, so false < true is spelled with the booleans that match
function booleanExpression (name: string, typeName: string, valueName: string, operator: Condition['operator'], value: boolean): Expression {
  const matching = [false, true].filter(candidate => ORDER_HOLDS[operator](Number(candidate) - Number(value)))
  const typeValues = { [typeName]: { S: 'BOOL' } }
  const isBoolean = `attribute_type(${name}, ${typeName})`
  if (matching.length === 0) return never(name)
  if (matching.length === 2) return { expression: isBoolean, values: typeValues }
  return { expression: `${isBoolean} AND ${name} = ${valueName}`, values: { ...typeValues, [valueName]: { BOOL: matching[0] } } }
}

function conditionExpression (index: number, { operator, value }: Condition): Expression {
  const name = `#f${index}`
  const typeName = `:t${index}`
  const valueName = `:v${index}`
  const typeValues = { [typeName]: { S: ATTRIBUTE_TYPES[typeof value as keyof typeof ATTRIBUTE_TYPES] } }
  if (value === null) return operator === '==' ? { expression: `attribute_type(${name}, ${typeName})`, values: typeValues } : never(name)
  if (typeof value === 'boolean') return booleanExpression(name, typeName, valueName, operator, value)
  return {
    expression: `attribute_type(${name}, ${typeName}) AND ${name} ${SQL_OPERATORS[operator]} ${valueName}`,
    values: { ...typeValues, [valueName]: toAttribute(value, name) }
  }
}

// DATA-9
function filterOf (conditions: Condition[]): Filter {
  if (conditions.length === 0) return {}
  const parts = conditions.map((condition, index) => conditionExpression(index, condition))
  return {
    FilterExpression: parts.map(part => part.expression).join(' AND '),
    ExpressionAttributeNames: Object.fromEntries(conditions.map(({ field }, index) => [`#f${index}`, field])),
    ExpressionAttributeValues: Object.assign({}, ...parts.map(part => part.values)) as Record<string, AttributeValue>
  }
}

// DATA-8
function startKeyOf (collection: CollectionReference, pageToken: string | undefined): Item | undefined {
  if (pageToken === undefined) return undefined
  const key = collection.primaryKey.key
  const token = decodeToken(pageToken)
  if (typeof token?.[key]?.S !== 'string') throw new Error('database/invalid-query: unknown page token')
  return { [key]: { S: token[key].S } }
}

export default defineRuntime<AwsDatabaseOptions, Adapter>({
  create ({ region, credentials }): Adapter {
    const client = new DynamoDBClient(clientConfig(region, credentials as AwsCredentials | undefined))

    // DDB-4
    const createDocument = async (collection: CollectionReference, data: Record<string, unknown>): Promise<unknown> => {
      requireStringKey(collection)
      const id = randomUUID()
      const item = { ...toItem(withoutKeyField(collection, data)), ...keyOf(collection, id) }
      await client.send(new PutItemCommand({
        TableName: collection.name,
        Item: item,
        ConditionExpression: 'attribute_not_exists(#key)',
        ExpressionAttributeNames: keyNames(collection)
      }))
      return { reference: { collection, id }, data: { ...data, [collection.primaryKey.key]: id } }
    }

    // DDB-5
    const getCollection = async (collection: CollectionReference, params: QueryParams = {}): Promise<unknown> => {
      requireStringKey(collection)
      checkQuery(params)
      const limit = params.limit ?? Infinity
      const filter = filterOf(params.where ?? [])
      let startKey = startKeyOf(collection, params.pageToken)
      const documents: Array<DocumentSnapshot<CollectionReference>> = []
      do {
        const page = await client.send(new ScanCommand({ TableName: collection.name, ConsistentRead: true, ExclusiveStartKey: startKey, ...filter }))
        const items = page.Items ?? []
        const taken = items.slice(0, limit - documents.length)
        documents.push(...taken.map(item => snapshotOf(collection, item)))
        if (taken.length < items.length) return { documents, next: encodeToken({ [collection.primaryKey.key]: taken[taken.length - 1][collection.primaryKey.key] }) }
        startKey = page.LastEvaluatedKey
      } while (startKey !== undefined && documents.length < limit)
      return startKey === undefined ? { documents } : { documents, next: encodeToken(startKey) }
    }

    // DDB-6
    const getDocument = async ({ collection, id }: DocumentReference<CollectionReference>): Promise<unknown> => {
      requireStringKey(collection)
      const response = await client.send(new GetItemCommand({ TableName: collection.name, Key: keyOf(collection, id), ConsistentRead: true }))
      if (response.Item === undefined) return undefined
      return snapshotOf(collection, response.Item)
    }

    // DDB-7
    const updateDocument = async (reference: DocumentReference<CollectionReference>, data: Record<string, unknown>): Promise<unknown> => {
      const { collection, id } = reference
      requireStringKey(collection)
      const expression = updateExpression(withoutEqualKey(collection, id, data))
      try {
        await client.send(new UpdateItemCommand({
          TableName: collection.name,
          Key: keyOf(collection, id),
          ...expression,
          ConditionExpression: 'attribute_exists(#key)',
          ExpressionAttributeNames: { ...expression?.ExpressionAttributeNames, ...keyNames(collection) }
        }))
      } catch (error) {
        if (isConditionFailure(error)) throw new DocumentNotFoundError(reference)
        throw error
      }
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
