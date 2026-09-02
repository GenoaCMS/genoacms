import type {
  AttributeType,
  BooleanAttributeType, ComponentsAttributeType, LinkAttributeType, MarkdownAttributeType,
  NumberAttributeType, RichTextAttributeType, StorageResourceAttributeType, StringAttributeType, TextAttributeType,
  LinkAttributeValue, StorageResourceValue
} from '$lib/script/components/componentHeader/component/types'

/**
 * What an attribute of each type holds once an author has filled it in.
 *
 * ## Links and storage resources are lists
 *
 * Both meta-schemas are `type: 'array'` with `minItems` and `maxItems`, and the page editor has
 * always written arrays. Only this mapping said otherwise, and the disagreement was invisible
 * because the tree builder cast the value to a single link on the way out — so `.isExternal` was
 * read off an array, came back `undefined`, and every published link resolved to an empty URL.
 *
 * A single-valued link attribute is expressible as one with `maxItems: 1`. A plural one is not
 * expressible the other way round, which is why the array is the shape and not the exception.
 *
 * ## The link and storage value types come from the shared vocabulary
 *
 * They used to be declared again here, with a difference: the local copies required the unused
 * member as an empty string — `{ isExternal: true, pageName: '', url }` — where the shared ones omit
 * it. Two shapes for one value, and the empty-string one canonicalizes to different bytes, so two
 * equivalent links would sign differently.
 */

type BooleanAttributeValue = boolean
type NumberAttributeValue = number
type StringAttributeValue = string
type TextAttributeValue = StringAttributeValue
type MarkdownAttributeValue = StringAttributeValue
type RichTextAttributeValue = StringAttributeValue
type LinksAttributeValue = Array<LinkAttributeValue>
type StorageResourcesAttributeValue = Array<StorageResourceValue>
type ComponentNodeReference = string
type ComponentsAttributeValue = Array<ComponentNodeReference>

type AttributeValue<T extends AttributeType = AttributeType> =
  T extends BooleanAttributeType ? BooleanAttributeValue :
    T extends NumberAttributeType ? NumberAttributeValue :
      T extends StringAttributeType ? StringAttributeValue :
        T extends TextAttributeType ? TextAttributeValue :
          T extends MarkdownAttributeType ? MarkdownAttributeValue :
            T extends RichTextAttributeType ? RichTextAttributeValue :
              T extends LinkAttributeType ? LinksAttributeValue :
                T extends StorageResourceAttributeType ? StorageResourcesAttributeValue :
                  T extends ComponentsAttributeType ? ComponentsAttributeValue :
                    never

export type {
  BooleanAttributeValue,
  NumberAttributeValue,
  StringAttributeValue,
  TextAttributeValue,
  MarkdownAttributeValue,
  RichTextAttributeValue,
  LinkAttributeValue,
  LinksAttributeValue,
  StorageResourceValue,
  StorageResourcesAttributeValue,
  ComponentsAttributeValue,
  ComponentNodeReference,
  AttributeValue
}
