import type { Diff } from 'deep-diff'
import type {
  AttributeReference,
  ComponentEntryAttributes
} from '@genoacms/internal/attributes'

/**
 * A component entry: what the CMS holds about a component.
 *
 * **The attribute vocabulary is no longer defined here.** It moved to `@genoacms/internal`, because
 * three packages need one definition of it: a language adapter emits attributes by reading a
 * component's source, this application validates and signs them, and a consumer SDK reads them to
 * render. It is re-exported below so that every module here keeps importing it from one place.
 *
 * What stays is the part the CMS owns and no adapter should see: a component's identity, the order
 * its attributes are shown in, and the undo history of editing them.
 */

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
  ComponentEntryAttributes
} from '@genoacms/internal/attributes'

/** Whether a component is described to the CMS or authored in it. */
type ComponentType = 'prebuilt' | 'dynamic'

type ComponentEntryReference = string

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
  ComponentType,
  ComponentEntryReference,
  AttributesChange,
  ComponentEntry,
  ComponentEntryCreation
}
