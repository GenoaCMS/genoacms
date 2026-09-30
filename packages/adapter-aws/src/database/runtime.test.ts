import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  ResourceNotFoundException,
  ConditionalCheckFailedException
} from '@aws-sdk/client-dynamodb'
import runtime from './runtime.js'

const dynamo = mockClient(DynamoDBClient)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const collection = { name: 'articles', primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object' } } as any
const document = { collection, id: 'x' }

const inputs = (command: new (...args: any[]) => unknown): any[] => dynamo.commandCalls(command as never).map(call => call.args[0].input)

async function provider () {
  return await runtime.create({ region: 'eu-central-1' }, { name: 'database', resources: [] })
}

beforeEach(() => { dynamo.reset() })

describe('the DynamoDB runtime', () => {
  it.fails('DDB-2: refuses a collection without a string key before any request, in every method', async () => {
    const numbered = { ...collection, primaryKey: { key: 'id', schema: { type: 'number' } } }
    const reference = { collection: numbered, id: 'x' }
    const database = await provider()
    const calls: Array<() => Promise<unknown>> = [
      async () => await database.createDocument(numbered, { t: 'a' }),
      async () => await database.getCollection(numbered),
      async () => await database.getDocument(reference),
      async () => await database.updateDocument(reference, { t: 'b' }),
      async () => await database.deleteDocument(reference)
    ]
    for (const call of calls) {
      await expect(call()).rejects.toThrow(/^database\/unsupported-key-type: articles$/)
    }
    expect(dynamo.calls()).toHaveLength(0)
  })

  it.fails('DDB-4: puts the document under a new UUID that overrides a key field, only if absent', async () => {
    dynamo.on(PutItemCommand).resolves({})
    const database = await provider()
    const data = { id: 'x', t: 'a' }
    const created = await database.createDocument(collection, data)
    const puts = inputs(PutItemCommand)
    expect(puts).toHaveLength(1)
    const id = puts[0].Item.id.S
    expect(id).toMatch(UUID)
    expect(id).not.toBe('x')
    expect(puts[0]).toMatchObject({
      TableName: 'articles',
      Item: { id: { S: id }, t: { S: 'a' } },
      ConditionExpression: 'attribute_not_exists(#key)',
      ExpressionAttributeNames: { '#key': 'id' }
    })
    expect(created).toEqual({ reference: { collection, id }, data })
  })

  it.fails('DDB-5: scans every page consistently and strips the key', async () => {
    dynamo.on(ScanCommand)
      .resolvesOnce({ Items: [{ id: { S: '1' }, t: { S: 'a' } }], LastEvaluatedKey: { id: { S: '1' } } })
      .resolvesOnce({ Items: [{ id: { S: '2' }, t: { S: 'b' } }] })
    const database = await provider()
    const snapshots = await database.getCollection(collection)
    const scans = inputs(ScanCommand)
    expect(scans).toHaveLength(2)
    expect(scans[0]).toMatchObject({ TableName: 'articles', ConsistentRead: true })
    expect(scans[0].ExclusiveStartKey).toBeUndefined()
    expect(scans[1]).toMatchObject({ TableName: 'articles', ConsistentRead: true, ExclusiveStartKey: { id: { S: '1' } } })
    expect(snapshots).toEqual([
      { reference: { collection, id: '1' }, data: { t: 'a' } },
      { reference: { collection, id: '2' }, data: { t: 'b' } }
    ])
  })

  it.fails('DDB-6: reads consistently and strips the key', async () => {
    dynamo.on(GetItemCommand).resolves({ Item: { id: { S: 'x' }, t: { S: 'a' } } })
    const database = await provider()
    const snapshot = await database.getDocument(document)
    expect(inputs(GetItemCommand)).toEqual([expect.objectContaining({ TableName: 'articles', Key: { id: { S: 'x' } }, ConsistentRead: true })])
    expect(snapshot).toEqual({ reference: document, data: { t: 'a' } })
  })

  it.fails('DDB-6: resolves undefined for a missing item', async () => {
    dynamo.on(GetItemCommand).resolves({})
    const database = await provider()
    expect(await database.getDocument(document)).toBeUndefined()
  })

  it.fails('DDB-7: updates only the given fields, only if the document exists', async () => {
    dynamo.on(UpdateItemCommand).resolves({})
    const database = await provider()
    const data = { a: 1, b: undefined, c: 'x' }
    const updated = await database.updateDocument(document, data)
    const updates = inputs(UpdateItemCommand)
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      TableName: 'articles',
      Key: { id: { S: 'x' } },
      UpdateExpression: 'SET #f0 = :v0, #f1 = :v1',
      ConditionExpression: 'attribute_exists(#key)'
    })
    expect(updates[0].ExpressionAttributeNames).toEqual({ '#key': 'id', '#f0': 'a', '#f1': 'c' })
    expect(updates[0].ExpressionAttributeValues).toEqual({ ':v0': { N: '1' }, ':v1': { S: 'x' } })
    expect(updated).toEqual({ reference: document, data })
  })

  it.fails('DDB-7: refuses to change the key', async () => {
    const database = await provider()
    await expect(database.updateDocument(document, { id: 'y', a: 1 })).rejects.toThrow(/^database\/key-immutable: id$/)
    expect(dynamo.calls()).toHaveLength(0)
  })

  it('DDB-7: deletes by key', async () => {
    dynamo.on(DeleteItemCommand).resolves({})
    const database = await provider()
    await database.deleteDocument(document)
    expect(inputs(DeleteItemCommand)).toEqual([{ TableName: 'articles', Key: { id: { S: 'x' } } }])
  })

  it.fails('DDB-3, DDB-7: propagates SDK errors unchanged', async () => {
    const missingTable = new ResourceNotFoundException({ message: 'no table', $metadata: {} })
    const missingDocument = new ConditionalCheckFailedException({ message: 'no document', $metadata: {} })
    dynamo.on(GetItemCommand).rejects(missingTable)
    dynamo.on(UpdateItemCommand).rejects(missingDocument)
    const database = await provider()
    await expect(database.getDocument(document)).rejects.toBe(missingTable)
    await expect(database.updateDocument(document, { a: 1 })).rejects.toBe(missingDocument)
  })
})
