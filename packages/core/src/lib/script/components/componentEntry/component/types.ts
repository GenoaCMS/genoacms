import type { Diff } from 'deep-diff'

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
  // stable identity, preserved across re-analysis so page relations survive
  uid: AttributeReference
  // derived from the component function's parameter name, and the key under
  // which the attribute is stored in ComponentEntryAttributes
  name: string
}

interface BooleanMetaSchema {
  type: 'boolean',
  title: string,
  description: string,
  required: boolean,
  default?: boolean,
}

interface NumberMetaSchema {
  type: 'number',
  title: string,
  description: string,
  minimum?: number,
  maximum?: number,
  multipleOf?: number,
  /**
   * Display precision — a non-standard keyword, kept deliberately.
   *
   * Not a duplicate of `multipleOf`, which constrains the *value*: a component may accept any real
   * number and still wish to render two decimals, so a step of 0.01 and a precision of 2 are
   * different statements that can legitimately disagree. Deriving one from the other would silently
   * change rendering for any component that set a step without a precision.
   *
   * It lives here rather than beside the schema so there is one place per fact. JSON Schema permits
   * unknown keywords and JCS canonicalizes any JSON, so nothing downstream is harmed.
   */
  decimalPlaces?: number,
  required: boolean,
  default?: number
}

interface StringMetaSchema {
  type: 'string',
  title: string,
  description: string,
  minLength?: number,
  maxLength?: number,
  pattern?: string,
  format?: string,
  required: boolean,
  default?: string
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
      type: ['string', 'null']
    },
    pageName: {
      type: ['string', 'null']
    }
  },
  required: ['isExternal']
}

interface LinksMetaSchema {
  type: 'array',
  title: string,
  description: string,
  items: LinkMetaSchema,
  default?: Array<LinkAttributeValue>,
  minItems?: number,
  maxItems?: number,
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
  default?: Array<StorageObject>,
  minItems?: number,
  maxItems?: number,
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
  default?: Array<string>,
  minItems?: number,
  maxItems?: number,
  required: boolean
}

interface BooleanAttribute extends AttributeBase {
  type: BooleanAttributeType,
  schema: BooleanMetaSchema
}

interface NumberAttribute extends AttributeBase {
  type: NumberAttributeType,
  schema: NumberMetaSchema
}

interface StringAttribute extends AttributeBase {
  type: StringAttributeType,
  schema: StringMetaSchema
}

// text shares StringMetaSchema with string/markdown/richText; maxLength and the
// default live inside the schema as they do for every other attribute
interface TextAttribute extends AttributeBase {
  type: TextAttributeType,
  schema: StringMetaSchema
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

// maxComponents and allowedComponents lived here alongside maxItems and
// items.enum, which say the same things; component named the accepted component
// and nothing read it. All three are gone
interface ComponentsAttribute extends AttributeBase {
  type: ComponentsAttributeType,
  schema: ComponentsAttributeMetaSchema
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
  attributeOrder: Array<AttributeReference>,
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
