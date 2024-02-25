interface AttributeBase {
  name: string,
  description: string,
  isRequired: boolean
}

interface BooleanAttribute extends AttributeBase {
  type: 'boolean',
  defaultValue: boolean
}

interface NumberAttribute extends AttributeBase {
  type: 'number',
  min: number,
  max: number,
  defaultValue: number,
  step: number,
  decimalPlaces: number
}

interface StringAttribute extends AttributeBase {
  type: 'string',
  regex: string,
  maxLength: number,
  defaultValue: string
}

interface TextAttribute extends AttributeBase {
  type: 'text',
  maxLength: number,
  defaultValue: string
}

interface MarkdownAttribute extends AttributeBase {
  type: 'markdown',
  defaultValue: string
}

interface RichTextAttribute extends AttributeBase {
  type: 'richText',
  defaultValue: string
}

interface LinkAttribute extends AttributeBase {
  type: 'link',
}

interface StorageResourceAttribute extends AttributeBase {
  type: 'storageResource',
}

interface ComponentsAttribute extends AttributeBase {
  type: 'components',
  component: string,
  maxComponents: number,
  allowedComponents: Array<string>
}

type Attribute = BooleanAttribute | NumberAttribute | StringAttribute | TextAttribute | MarkdownAttribute
  | RichTextAttribute | LinkAttribute | StorageResourceAttribute | ComponentsAttribute
type AttributeType = Attribute['type']

interface ComponentEntry {
  version: string,
  attributes: Array<Attribute>
}

interface PrebuiltComponentEntry {
  name: string,
  versions: Record<string, ComponentEntry>,
  currentVersion: string
}

export type {
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
  AttributeType,
  ComponentEntry,
  PrebuiltComponentEntry
}
