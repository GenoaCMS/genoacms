import { describe, it, expect, vi, beforeEach } from 'vitest'
import runtime from './runtime.js'

const instances = []
vi.mock('knex', () => ({
  default: vi.fn((config) => {
    const sql = vi.fn(() => ({ insert: vi.fn(async () => {}) }))
    sql.config = config
    instances.push(sql)
    return sql
  })
}))

beforeEach(() => { instances.length = 0 })

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
})
