/**
 * The attribute vocabulary: what a component declares about the values it accepts.
 *
 * This is the contract **between** the CMS, a language adapter and a consumer SDK, which is why it
 * lives here rather than in any one of them. A language adapter emits these shapes by reading a
 * component's source; the CMS validates, stores and signs them; a client SDK reads them to render.
 * Three packages, one definition.
 *
 * ## An attribute is a meta-schema
 *
 * Every attribute carries a `schema` describing its value in JSON Schema terms, and **nothing
 * beside it**. Earlier revisions carried flat siblings — `maxLength` next to `schema.maxLength`,
 * `maxComponents` next to `maxItems` — which is two places for one fact. Inside a signed payload
 * that is a correctness hazard rather than untidiness: the two can disagree and the signature
 * attests to both.
 *
 * ## An unset constraint is an absent key
 *
 * Optional constraints are omitted when unset, never written as `null`, `undefined` or an empty
 * value. Component payloads are signed over their RFC 8785 canonical form, and `{"minimum":null}`
 * and `{}` canonicalize to different bytes — so two producers disagreeing about which to write make
 * the same component sign two ways.
 */

type AttributeReference = string

type BooleanAttributeType = 'boolean'
type NumberAttributeType = 'number'
type StringAttributeType = 'string'
type TextAttributeType = 'text'
type MarkdownAttributeType = 'markdown'
type RichTextAttributeType = 'richText'
type LinkAttributeType = 'link'
type StorageResourceAttributeType = 'storageResource'
type ComponentsAttributeType = 'components'

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

interface AttributeBase {
  // stable identity, preserved across re-analysis so page relations survive
  uid: AttributeReference
  // derived from the component function's parameter name, and the key under
  // which the attribute is stored in ComponentHeaderAttributes
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

/**
 * A stored object, as an attribute value names one.
 *
 * Declared structurally rather than imported from `@genoacms/cloudabstraction`, which depends on
 * this package — importing back would be a cycle. The two fields are the same two the meta-schema
 * below requires, so the shape is stated once here and matched by any storage reference.
 *
 * It replaces a `StorageObject` that this vocabulary referred to and never imported: a dangling
 * type name that resolved to nothing, so the default was effectively unchecked.
 */
interface StorageResourceValue {
  bucket: string,
  name: string
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
  default?: Array<StorageResourceValue>,
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

/** Attributes keyed by their stable uid, which is how a page node refers to one. */
type ComponentHeaderAttributes = Record<AttributeReference, Attribute>

export type {
  AttributeReference,
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
  BooleanMetaSchema,
  NumberMetaSchema,
  StringMetaSchema,
  ExternalLink,
  InternalLink,
  LinkAttributeValue,
  LinkMetaSchema,
  LinksMetaSchema,
  StorageResourceValue,
  StorageResourceMetaSchema,
  StorageResourcesMetaSchema,
  ComponentsAttributeMetaSchema,
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
  ComponentHeaderAttributes
}
