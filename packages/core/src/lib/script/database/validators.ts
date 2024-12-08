// import Ajv from 'ajv'
// import type { JSONSchemaType } from 'ajv'
//
// export const ajv = new Ajv()
//
// ajv.addFormat('reference', {
//  type: 'string',
//  validate: (reference: string) => {
//    return true
//  }
// })
// ajv.addFormat('markdown', {
//  type: 'string',
//  validate: (markdown: string) => {
//    return true
//  }
// })
// ajv.addFormat('storageResources', {
//  type: 'array',
//  items: {
//    type: 'object',
//    properties: {
//      bucket: { type: 'string' },
//      name: { type: 'string' }
//    },
//    required: ['bucket', 'name']
//  },
//  validate: (resources: Array<{ bucket: string, name: string }>) => {
//    return true
//  }
// })
// ajv.addFormat('text', {
//  type: 'string',
//  validate: (text: string) => {
//    return true
//  }
// })
//
// export function validateDocumentData (schema: JSONSchemaType<any>, documentData: object) {
//  return ajv.validate(schema, documentData)
// }

// TODO: Implement validators

const formats = {
  reference: (reference: string) => {
    return true
  },
  markdown: (markdown: string) => {
    return true
  },
  storageResource: (resource: any): resource is { bucket: string, name: string } => {
    if (!resource) return false
    if (typeof resource !== 'object') return false
    if (!resource.bucket) return false
    if (!resource.name) return false
    return true
  },
  text: (text: string) => {
    return true
  }
}

export { formats }
