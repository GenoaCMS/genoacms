import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

type BooleanAttributeValue = boolean
type NumberAttributeValue = number
type StringAttributeValue = string
type TextAttributeValue = StringAttributeValue
type MarkdownAttributeValue = StringAttributeValue
type RichTextAttributeValue = StringAttributeValue
interface LinkAttributeValue<T extends boolean = boolean> {
  isExternal: T,
  url: T extends true ? string : undefined,
  pageName: T extends false ? string : undefined
}
type StorageResourceAttributeValue = ObjectReference
type ComponentNodeReference = string
type ComponentsAttributeValue = Array<ComponentNodeReference>

type AttributeValue = BooleanAttributeValue | NumberAttributeValue | TextAttributeValue | MarkdownAttributeValue
  | RichTextAttributeValue | LinkAttributeValue | StorageResourceAttributeValue | ComponentsAttributeValue

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
