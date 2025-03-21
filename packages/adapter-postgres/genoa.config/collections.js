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
  primaryKey: 'id',
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
