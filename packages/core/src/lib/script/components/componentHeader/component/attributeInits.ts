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
 * An unset constraint is **omitted**, never null. Under RFC 8785,
 * JCS({"minimum": null}) and JCS({}) are different byte streams and therefore
 * different digests, so a client SDK that drops nulls and one that preserves
 * them would disagree on every signature.
 *
 * This file previously did the opposite, because the schemas marked those keys
 * required and JSON.stringify drops undefined. The schemas no longer require
 * them and no longer accept null, so omission is now both possible and the only
 * thing that validates. attributeInits.test.ts guards it in that direction.
 *
 * **An empty value counts as unset too.** `pattern: ''` constrains nothing and
 * `default: []` says what an absent default says, so writing either is a second
 * way to express "not set". This file wrote them while the analyzer omitted
 * them, which meant a component authored in code signed differently from the
 * same component registered by hand. See `constraints.ts` for the shared rule
 * the editors write through.
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
  required: false
}

const stringSchemaInit: StringMetaSchema = {
  type: 'string',
  title: '',
  description: '',
  required: false
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
  required: false
}

const componentsSchemaInit = {
  type: 'array',
  title: '',
  description: '',
  items: {
    type: 'string'
  },
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
