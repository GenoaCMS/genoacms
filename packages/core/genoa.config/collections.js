/** @typedef {import('@genoacms/contracts/database').CollectionReference} CollectionReference */
import {
  storageResource,
  nullableStorageResource,
  reference
} from '@genoacms/contracts/schemas'

/** @type {CollectionReference} */
const testCollection = {
  name: 'test',
  primaryKey: { key: 'id', schema: { type: 'string' } },
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
      isA: {
        type: 'boolean'
      },
      markdown: {
        type: 'string',
        format: 'markdown'
      }
    }
  }
}

/** @type {CollectionReference} */
const authors = {
  name: 'authors',
  primaryKey: { key: 'id', schema: { type: 'string' } },
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
      role: {
        type: 'string'
      },
      avatar: nullableStorageResource
    }
  }
}

const heroSection = {
  properties: {
    type: {
      const: 'hero'
    },
    headline: {
      type: 'string'
    },
    subheadline: {
      type: 'string',
      format: 'text'
    },
    coverImage: nullableStorageResource,
    cta: {
      type: 'object',
      properties: {
        label: {
          type: 'string'
        },
        url: {
          type: 'string'
        },
        style: {
          type: 'string',
          enum: ['primary', 'secondary', 'outline']
        }
      }
    }
  }
}

const gallerySection = {
  properties: {
    type: {
      const: 'gallery'
    },
    title: {
      type: 'string'
    },
    columns: {
      type: 'number'
    },
    images: {
      type: 'array',
      items: storageResource
    }
  }
}

const featureGridSection = {
  properties: {
    type: {
      const: 'featureGrid'
    },
    title: {
      type: 'string'
    },
    features: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          icon: {
            type: 'string'
          },
          heading: {
            type: 'string'
          },
          body: {
            type: 'string',
            format: 'markdown'
          }
        }
      }
    }
  }
}

const richTextSection = {
  properties: {
    type: {
      const: 'richText'
    },
    body: {
      type: 'string',
      format: 'markdown'
    },
    callout: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean'
        },
        note: {
          type: 'string'
        }
      }
    }
  }
}

/** @type {CollectionReference} */
const articles = {
  name: 'articles',
  primaryKey: { key: 'id', schema: { type: 'string' } },
  schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid'
      },
      title: {
        type: 'string'
      },
      slug: {
        type: 'string'
      },
      isPublished: {
        type: 'boolean'
      },
      author: reference({ collection: 'authors' }),
      contributors: {
        type: 'array',
        items: reference({ collection: 'authors' })
      },
      metadata: {
        type: 'object',
        properties: {
          readingTimeMinutes: {
            type: 'number'
          },
          tags: {
            type: 'array',
            items: {
              type: 'string'
            }
          },
          seo: {
            type: 'object',
            properties: {
              metaTitle: {
                type: 'string'
              },
              metaDescription: {
                type: 'string',
                format: 'text'
              },
              socialShareImage: nullableStorageResource
            }
          }
        }
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
            heroSection,
            gallerySection,
            featureGridSection,
            richTextSection
          ]
        }
      }
    }
  }
}

export const collections = [testCollection, authors, articles]
