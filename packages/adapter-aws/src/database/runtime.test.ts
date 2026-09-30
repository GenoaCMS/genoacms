import { describe, it, expect, vi } from 'vitest'
import runtime from './runtime.js'

const sent = []
const responses = []
vi.mock('@aws-sdk/client-dynamodb', () => {
  const command = (type) => vi.fn(function (input) { this.type = type; this.input = input })
  return {
    DynamoDBClient: vi.fn(function () { this.send = vi.fn(async (c) => { sent.push(c); return responses.shift() ?? {} }) }),
    GetItemCommand: command('GetItem'),
    PutItemCommand: command('PutItem'),
    DeleteItemCommand: command('DeleteItem'),
    ScanCommand: command('Scan')
  }
})

const collection = { name: 'articles', primaryKey: { key: 'id' }, schema: {} }

describe('the DynamoDB runtime', () => {
  it('round-trips a nested document through the item conversion', async () => {
    const database = runtime.create({ region: 'eu' }, { name: 'dynamo', resources: [] })
    const document = { title: 'T', views: 3, draft: false, tags: ['a', 'b'], author: { name: 'Ada', note: null } }
    const created = await database.createDocument(collection, document)
    const put = sent.find(c => c.type === 'PutItem')
    responses.push({ Item: put.input.Item })
    const read = await database.getDocument(created.reference)
    expect(read.data).toEqual(document)
  })
})
