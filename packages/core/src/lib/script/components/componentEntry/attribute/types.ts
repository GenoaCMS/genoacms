import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
import type {
  AttributeType,
  BooleanAttributeType, ComponentsAttributeType, LinkAttributeType, MarkdownAttributeType,
  NumberAttributeType, RichTextAttributeType, StorageResourceAttributeType, StringAttributeType, TextAttributeType
} from '$lib/script/components/componentEntry/component/types'

type BooleanAttributeValue = boolean
type NumberAttributeValue = number
type StringAttributeValue = string
type TextAttributeValue = StringAttributeValue
type MarkdownAttributeValue = StringAttributeValue
type RichTextAttributeValue = StringAttributeValue
interface InternalLinkAttributeValue {
  isExternal: false,
  pageName: string,
  url: ''
}
interface ExternalLinkAttributeValue {
  isExternal: true,
  pageName: '',
  url: string
}
type LinkAttributeValue = InternalLinkAttributeValue | ExternalLinkAttributeValue
type StorageResourceAttributeValue = ObjectReference
type ComponentNodeReference = string
type ComponentsAttributeValue = Array<ComponentNodeReference>

type AttributeValue<T extends AttributeType = AttributeType> =
  T extends BooleanAttributeType ? BooleanAttributeValue :
    T extends NumberAttributeType ? NumberAttributeValue :
      T extends StringAttributeType ? StringAttributeValue :
        T extends TextAttributeType ? TextAttributeValue :
          T extends MarkdownAttributeType ? MarkdownAttributeValue :
            T extends RichTextAttributeType ? RichTextAttributeValue :
              T extends LinkAttributeType ? LinkAttributeValue :
                T extends StorageResourceAttributeType ? StorageResourceAttributeValue :
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
  StorageResourceAttributeValue,
  ComponentsAttributeValue,
  ComponentNodeReference,
  AttributeValue
}
