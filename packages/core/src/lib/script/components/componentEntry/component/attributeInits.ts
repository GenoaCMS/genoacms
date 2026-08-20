import type {
  AttributeType,
  LinkMetaSchema,
  LinksMetaSchema,
  StorageResourceMetaSchema,
  StorageResourcesMetaSchema,
  StringMetaSchema
} from './types'

/**
 * Starting meta-schemas for attributes added by hand in the prebuilt component
 * editor.
 *
 * Unset numeric constraints are null, not undefined. These objects are
 * JSON-serialised before being validated against componentEntrySchema and
 * stored, and JSON.stringify drops undefined keys — which fails the required
 * fields those schemas declare. attributeInits.test.ts guards this.
 */

const booleanSchemaInit = {
  type: 'boolean',
  title: '',
  description: '',
  required: false,
  default: false
}

const numberSchemaInit = {
  type: 'number',
  title: '',
  description: '',
  minimum: null,
  maximum: null,
  multipleOf: null,
  required: false,
  default: null
}

const stringSchemaInit: StringMetaSchema = {
  type: 'string',
  title: '',
  description: '',
  minLength: null,
  maxLength: null,
  pattern: '',
  format: '',
  required: false,
  default: ''
}

const linkSchemaInit: LinkMetaSchema = {
  type: 'object',
  properties: {
    isExternal: { type: 'boolean' },
    url: { type: ['string', 'null'] },
    pageName: { type: ['string', 'null'] }
  },
  required: ['isExternal']
}

const linksSchemaInit: LinksMetaSchema = {
  type: 'array',
  title: '',
  description: '',
  items: linkSchemaInit,
  default: [],
  minItems: null,
  maxItems: null,
  required: false
}

const storageResourceSchemaInit: StorageResourceMetaSchema = {
  type: 'object',
  properties: {
    bucket: { type: 'string' },
    name: { type: 'string' }
  },
  required: ['bucket', 'name']
}

const storageResourcesSchemaInit: StorageResourcesMetaSchema = {
  type: 'array',
  title: '',
  description: '',
  items: storageResourceSchemaInit,
  default: [],
  minItems: null,
  maxItems: null,
  required: false
}

const componentsSchemaInit = {
  type: 'array',
  title: '',
  description: '',
  items: {
    type: 'string',
    enum: []
  },
  default: [],
  minItems: null,
  maxItems: null,
  required: false
}

interface AttributeTypeInit {
  name: AttributeType
  schema: object
}

const attributeTypeInits: Array<AttributeTypeInit> = [
  { name: 'boolean', schema: booleanSchemaInit },
  { name: 'number', schema: numberSchemaInit },
  { name: 'string', schema: stringSchemaInit },
  { name: 'text', schema: stringSchemaInit },
  { name: 'markdown', schema: stringSchemaInit },
  { name: 'richText', schema: stringSchemaInit },
  { name: 'link', schema: linksSchemaInit },
  { name: 'storageResource', schema: storageResourcesSchemaInit },
  { name: 'components', schema: componentsSchemaInit }
]

export {
  booleanSchemaInit,
  numberSchemaInit,
  stringSchemaInit,
  linkSchemaInit,
  linksSchemaInit,
  storageResourceSchemaInit,
  storageResourcesSchemaInit,
  componentsSchemaInit,
  attributeTypeInits
}
export type { AttributeTypeInit }
