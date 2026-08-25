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
 * What stays is the part the CMS owns and no adapter should see: a component's identity and the
 * order its attributes are shown in.
 *
 * ## Editing history is no longer part of it
 *
 * The entry used to carry `history` and `future` of its own. They were declared, initialized empty,
 * required by the schema, and **never read or written** — the prebuilt editor's undo and redo are
 * still empty server actions. So nothing is lost by moving them out, and two things are gained.
 *
 * An entry now describes a component and nothing else, which is what lets it be **published and
 * signed**: a consumer needs `attributeOrder` to call a component's parameters in the right order,
 * and has no use for how the author arrived at it. Signing an entry that carried its history would
 * publish every intermediate state of an author's afternoon, and would change the signature whenever
 * an unrelated edit was undone.
 *
 * And when undo and redo are wired up, the steps live in an `UndoRedoAdjunct` stored beside this —
 * the same operations the page editor already uses, rather than a second implementation of them.
 * An adjunct rather than a wrapper, so that this description stays a single stored fact: a wrapper
 * would put it inside the history object, and publishing it would mean two copies with nothing to
 * say which wins when they disagree.
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

interface ComponentEntry {
  uid: ComponentEntryReference,
  type: ComponentType,
  name: string,
  attributes: ComponentEntryAttributes,
  attributeOrder: Array<AttributeReference>
}

interface ComponentEntryCreation {
  name: string
}

export type {
  ComponentType,
  ComponentEntryReference,
  ComponentEntry,
  ComponentEntryCreation
}
