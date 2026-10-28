import { describe, it, expect, vi, beforeEach } from 'vitest'
import runtime from './runtime.js'

const instances = []
const executed = []
vi.mock('knex', async (importOriginal) => {
  const { default: knex } = await importOriginal()
  return {
    default: vi.fn((config) => {
      const sql = knex(config)
      sql.config = config
      sql.client.acquireConnection = async () => ({})
      sql.client.releaseConnection = async () => {}
      sql.client._query = async (connection, query) => {
        executed.push({ sql: query.sql, bindings: query.bindings })
        query.response = { rows: [], rowCount: 0, command: query.sql.split(' ')[0].toUpperCase() }
        return query
      }
      instances.push(sql)
      return sql
    })
  }
})

beforeEach(() => { instances.length = 0; executed.length = 0 })

const articles = { name: 'articles', primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object' } }

const options = { host: 'localhost', port: undefined, database: 'db', user: 'u', password: 'p' }

describe('the Postgres runtime', () => {
  it('connects with only the defined options', () => {
    runtime.create(options, { name: 'pg', resources: [] })
    expect(instances[0].config).toEqual({ client: 'pg', connection: { host: 'localhost', database: 'db', user: 'u', password: 'p' } })
  })

  it('builds one pool per provider', () => {
    runtime.create(options, { name: 'one', resources: [] })
    runtime.create({ ...options, database: 'other' }, { name: 'two', resources: [] })
    expect(instances).toHaveLength(2)
  })

  it('refuses a document without a primary key, as today', async () => {
    const database = runtime.create(options, { name: 'pg', resources: [] })
    await expect(database.createDocument({ name: 'articles' }, { title: 't' })).rejects.toThrow('Missing primaryKey of articles')
  })

  it.fails('DATA-9: conditions are typed and strings compare in byte order', async () => {
    const database = runtime.create(options, { name: 'pg', resources: [] })
    await database.getCollection(articles, { where: [{ field: 'title', operator: '<', value: 'b' }] })
    const statements = executed.map(statement => statement.sql).join('\n')
    expect(statements).toContain('jsonb_typeof')
    expect(statements).toContain('COLLATE "C"')
    expect(executed.flatMap(statement => statement.bindings)).toContain('b')
  })

  it.fails('DATA-5, DATA-6: a missing row reads as undefined and updates as not found', async () => {
    const database = runtime.create(options, { name: 'pg', resources: [] })
    const reference = { collection: articles, id: 'x' }
    expect(await database.getDocument(reference)).toBeUndefined()
    const failure = await database.updateDocument(reference, { title: 't' }).catch(error => error)
    expect(failure).toMatchObject({ name: 'DocumentNotFoundError', message: 'database/not-found: articles/x' })
  })
})
