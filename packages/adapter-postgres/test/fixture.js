import knex from 'knex'

const conformance = {
  name: 'conformance',
  primaryKey: { key: 'id', schema: { type: 'string' } },
  schema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      run: { type: 'string' },
      batch: { type: 'string' },
      label: { type: 'string' },
      v: {},
      title: { type: 'string' },
      count: { type: 'number' },
      flag: { type: 'boolean' },
      nothing: { type: 'string' },
      tags: { type: 'array' },
      meta: { type: 'object' }
    }
  }
}

export const collection = conformance

export async function recreateConformanceTable (connection) {
  const sql = knex({ client: 'pg', connection })
  try {
    await sql.schema.dropTableIfExists(conformance.name)
    await sql.schema.createTable(conformance.name, table => {
      table.uuid('id').primary().defaultTo(sql.raw('gen_random_uuid()'))
      table.text('run')
      table.text('batch')
      table.text('label')
      table.jsonb('v')
      table.text('title')
      table.specificType('count', 'double precision')
      table.boolean('flag')
      table.text('nothing')
      table.jsonb('tags')
      table.jsonb('meta')
    })
  } finally {
    await sql.destroy()
  }
}
