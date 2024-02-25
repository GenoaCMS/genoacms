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
  name: string,
  description: string,
  isRequired: boolean
}

interface BooleanAttribute extends AttributeBase {
  type: BooleanAttributeType,
  defaultValue: boolean
}

interface NumberAttribute extends AttributeBase {
  type: NumberAttributeType,
  min: number,
  max: number,
  defaultValue: number,
  step: number,
  decimalPlaces: number
}

interface StringAttribute extends AttributeBase {
  type: StringAttributeType,
  regex: string,
  maxLength: number,
  defaultValue: string
}

interface TextAttribute extends AttributeBase {
  type: TextAttributeType,
  maxLength: number,
  defaultValue: string
}

interface MarkdownAttribute extends AttributeBase {
  type: MarkdownAttributeType,
  defaultValue: string
}

interface RichTextAttribute extends AttributeBase {
  type: RichTextAttributeType,
  defaultValue: string
}

interface LinkAttribute extends AttributeBase {
  type: LinkAttributeType,
}

interface StorageResourceAttribute extends AttributeBase {
  type: StorageResourceAttributeType,
}

interface ComponentsAttribute extends AttributeBase {
  type: ComponentsAttributeType,
  component: string,
  maxComponents: number,
  allowedComponents: Array<string>
}

type Attribute<T extends AttributeType = AttributeType> =
  T extends BooleanAttributeType ? BooleanAttribute :
    T extends NumberAttributeType ? NumberAttribute :
      T extends StringAttributeType ? StringAttribute :
        T extends TextAttributeType ? TextAttribute :
          T extends MarkdownAttributeType ? MarkdownAttribute :
            T extends RichTextAttributeType ? RichTextAttribute :
              T extends LinkAttributeType ? LinkAttribute :
                T extends StorageResourceAttributeType ? StorageResourceAttribute :
                  T extends ComponentsAttributeType ? ComponentsAttribute :
                    never

interface ComponentEntry {
  version: string,
  attributes: Array<Attribute>
}

type PrebuiltComponentReference = string

interface PrebuiltComponentEntry {
  uid: PrebuiltComponentReference,
  name: string,
  versions: Record<string, ComponentEntry>,
  currentVersion: string
}

export type {
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
  ComponentEntry,
  PrebuiltComponentReference,
  PrebuiltComponentEntry
}
