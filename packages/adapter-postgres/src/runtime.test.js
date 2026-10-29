import { describe, it, expect, vi, beforeEach } from 'vitest'
import runtime from './runtime.js'

const instances = []
const executed = []
const COLUMNS = ['id', 'title', 'a.b', '*']
const rowsFor = (sql) => sql.includes('information_schema') ? COLUMNS.map(column => ({ column_name: column })) : []
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
        query.response = { rows: rowsFor(query.sql), rowCount: 0, command: query.sql.split(' ')[0].toUpperCase() }
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

  it('DATA-9: conditions are typed and strings compare in byte order', async () => {
    const database = runtime.create(options, { name: 'pg', resources: [] })
    await database.getCollection(articles, { where: [{ field: 'title', operator: '<', value: 'b' }] })
    const statements = executed.map(statement => statement.sql).join('\n')
    expect(statements).toContain('jsonb_typeof')
    expect(statements).toContain('COLLATE "C"')
    expect(executed.flatMap(statement => statement.bindings)).toContain('b')
  })

  it('DATA-5, DATA-6: a missing row reads as undefined and updates as not found', async () => {
    const database = runtime.create(options, { name: 'pg', resources: [] })
    const reference = { collection: articles, id: 'x' }
    expect(await database.getDocument(reference)).toBeUndefined()
    const failure = await database.updateDocument(reference, { title: 't' }).catch(error => error)
    expect(failure).toMatchObject({ name: 'DocumentNotFoundError', message: 'database/not-found: articles/x' })
  })

  it.fails('DATA-8, DATA-9, CF61: field names are literal and a field without a column matches nothing', async () => {
    const database = runtime.create(options, { name: 'pg', resources: [] })
    const asked = (field) => ({ where: [{ field, operator: '==', value: 'x' }] })
    const selects = () => executed.filter(statement => !statement.sql.includes('information_schema'))

    await database.getCollection(articles, asked('a.b'))
    await database.getCollection(articles, asked('*'))
    const statements = selects().map(statement => statement.sql).join('\n')
    expect(statements).toContain('"a.b"')
    expect(statements).not.toContain('"a"."b"')
    expect(statements).toContain('"*"')

    executed.length = 0
    expect(await database.getCollection(articles, asked('missing'))).toEqual({ documents: [] })
    expect(selects()).toEqual([])
  })
})
