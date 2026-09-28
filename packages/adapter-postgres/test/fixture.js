import knex from 'knex'

const storageResource = {
  type: 'object',
  title: 'storageResource',
  properties: {
    bucket: {
      type: 'string'
    },
    name: {
      type: 'string'
    }
  }
}

const gallerySection = {
  properties: {
    id: {
      type: 'string',
      format: 'uuid'
    },
    type: {
      const: 'gallery'
    },
    name: {
      type: 'string',
      minLength: 1
    },
    description: {
      type: 'string'
    },
    images: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      items: storageResource
    }
  }
}

const zigzagSection = {
  properties: {
    type: {
      const: 'zizag'
    },
    name: {
      type: 'string'
    },
    description: {
      type: 'string'
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string'
          },
          description: {
            type: 'string'
          },
          image: {
            type: 'object',
            title: 'storageResource'
          }
        }
      }
    }
  }
}

const references = {
  name: 'References',
  primaryKey: { key: 'id', schema: {} },
  schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid'
      },
      name: {
        type: 'string'
      },
      description: {
        type: 'string'
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          discriminator: {
            propertyName: 'type'
          },
          required: ['type'],
          oneOf: [
            gallerySection,
            zigzagSection
          ]
        }
      }
    }
  }
}

export const collections = [references]

export async function recreateReferencesTable (connection) {
  const sql = knex({ client: 'pg', connection })
  try {
    await sql.schema.dropTableIfExists(references.name)
    await sql.schema.createTable(references.name, table => {
      table.uuid('id').primary()
      table.text('name')
      table.text('description')
      table.specificType('sections', 'jsonb[]')
    })
  } finally {
    await sql.destroy()
  }
}

export const testDocuments = [{
  id: crypto.randomUUID(),
  name: 'Test documnet 1',
  description: 'desc but changed',
  sections: []
}, {
  id: crypto.randomUUID(),
  name: 'Test documnet 2',
  description: 'Another description',
  sections: [{

  }]
}]
