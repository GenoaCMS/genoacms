import type { Diff } from 'deep-diff'
import type { JSONSchemaType } from 'ajv'

type BooleanAttributeType = 'boolean'
type NumberAttributeType = 'number'
type StringAttributeType = 'string'
type TextAttributeType = 'text'
type MarkdownAttributeType = 'markdown'
type RichTextAttributeType = 'richText'
type LinkAttributeType = 'link'
type StorageResourceAttributeType = 'storageResource'
type ComponentsAttributeType = 'components'
type ComponentType = 'prebuilt' | 'coded'

type AttributeType =
  BooleanAttributeType
  | NumberAttributeType
  | StringAttributeType
  | TextAttributeType
  | MarkdownAttributeType
  | RichTextAttributeType
  | LinkAttributeType
  | StorageResourceAttributeType
  | ComponentsAttributeType

type AttributeReference = string

interface AttributeBase {
  uid: AttributeReference
}

interface BooleanMetaSchema {
  type: 'boolean',
  title: string,
  description: string,
  required: boolean,
  default: boolean,
}

interface NumberMetaSchema {
  type: 'number',
  title: string,
  description: string,
  minimum?: number,
  maximum?: number,
  multipleOf?: number,
  required: boolean,
  default: number
}

interface StringMetaSchema {
  type: 'string',
  title: string,
  description: string,
  minLength?: number | null,
  maxLength?: number | null,
  pattern?: string,
  format?: string,
  required: boolean,
  default: string
}

interface ExternalLink {
  isExternal: true,
  url: string
}

interface InternalLink {
  isExternal: false,
  pageName: string
}

type LinkAttributeValue = ExternalLink | InternalLink

interface LinkMetaSchema {
  type: 'object',
  properties: {
    isExternal: {
      type: 'boolean'
    },
    url: {
      type: 'string',
      nullable: true
    },
    pageName: {
      type: 'string',
      nullable: true
    }
  },
  required: ['isExternal']
}

interface LinksMetaSchema {
  type: 'array',
  title: string,
  description: string,
  items: LinkMetaSchema,
  default?: Array<LinkAttributeValue> | null,
  minItems?: number | null,
  maxItems?: number | null,
  required: boolean
}

interface StorageResourceMetaSchema {
  type: 'object',
  properties: {
    bucket: {
      type: 'string'
    },
    name: {
      type: 'string'
    }
  },
  required: ['bucket', 'name']
}

interface StorageResourcesMetaSchema {
  type: 'array',
  title: string,
  description: string,
  items: StorageResourceMetaSchema,
  default?: Array<StorageObject> | null,
  minItems?: number | null,
  maxItems?: number | null,
  required: boolean
}

interface ComponentsAttributeMetaSchema {
  type: 'array',
  title: string,
  description: string,
  items: {
    type: 'string',
    enum?: Array<string>
  },
  default?: Array<string> | null,
  minItems?: number,
  maxItems?: number,
  required: boolean
}

interface BooleanAttribute extends AttributeBase {
  type: BooleanAttributeType,
  schema: JSONSchemaType<BooleanMetaSchema>
}

interface NumberAttribute extends AttributeBase {
  type: NumberAttributeType,
  schema: JSONSchemaType<NumberMetaSchema>,
  decimalPlaces: number
}

interface StringAttribute extends AttributeBase {
  type: StringAttributeType,
  schema: StringMetaSchema
}

interface TextAttribute extends AttributeBase {
  type: TextAttributeType,
  maxLength: number,
  defaultValue: string
}

interface MarkdownAttribute extends AttributeBase {
  type: MarkdownAttributeType,
  schema: StringMetaSchema
}

interface RichTextAttribute extends AttributeBase {
  type: RichTextAttributeType,
  schema: StringMetaSchema
}

interface LinkAttribute extends AttributeBase {
  type: LinkAttributeType,
  schema: LinksMetaSchema
}

interface StorageResourceAttribute extends AttributeBase {
  type: StorageResourceAttributeType,
  schema: StorageResourcesMetaSchema
}

interface ComponentsAttribute extends AttributeBase {
  type: ComponentsAttributeType,
  component: string,
  maxComponents: number,
  allowedComponents: Array<string>,
  schema: JSONSchemaType<ComponentsAttributeMetaSchema>
}

type Attribute =
  BooleanAttribute
  | NumberAttribute
  | StringAttribute
  | TextAttribute
  | MarkdownAttribute
  | RichTextAttribute
  | LinkAttribute
  | StorageResourceAttribute
  | ComponentsAttribute

type ComponentEntryReference = string

type ComponentEntryAttributes = Record<AttributeReference, Attribute>

type AttributesChange = Array<Diff<ComponentEntryAttributes>>

interface ComponentEntry {
  uid: ComponentEntryReference,
  type: ComponentType,
  name: string,
  attributes: ComponentEntryAttributes,
  history: Array<AttributesChange>,
  future: Array<AttributesChange>
}

interface ComponentEntryCreation {
  name: string
}

export type {
  AttributeReference,
  ComponentType,
  BooleanMetaSchema,
  NumberMetaSchema,
  StringMetaSchema,
  LinkMetaSchema,
  LinksMetaSchema,
  StorageResourceMetaSchema,
  StorageResourcesMetaSchema,
  ComponentsAttributeMetaSchema,
  BooleanAttributeType,
  NumberAttributeType,
  StringAttributeType,
  TextAttributeType,
  MarkdownAttributeType,
  RichTextAttributeType,
  LinkAttributeType,
  StorageResourceAttributeType,
  ComponentsAttributeType,
  AttributeType,
  AttributeBase,
  BooleanAttribute,
  NumberAttribute,
  StringAttribute,
  TextAttribute,
  MarkdownAttribute,
  RichTextAttribute,
  LinkAttribute,
  StorageResourceAttribute,
  ComponentsAttribute,
  Attribute,
  ComponentEntryAttributes,
  ComponentEntryReference,
  ComponentEntry,
  ComponentEntryCreation
}
