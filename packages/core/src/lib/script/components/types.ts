import { Checkbox, Input, NumberInput } from 'flowbite-svelte'

interface Attribute {
  name: string,
  description: string,
  isRequired: boolean
}

interface BooleanAttribute extends Attribute {
  type: 'boolean',
  defaultValue: boolean
}

interface NumberAttribute extends Attribute {
  type: 'number',
  min: number,
  max: number,
  defaultValue: number,
  step: number,
  decimalPlaces: number
}

interface StringAttribute extends Attribute {
  type: 'string',
  regex: string,
  maxLength: number,
  defaultValue: string
}

interface TextAttribute extends Attribute {
  type: 'text',
  maxLength: number,
  defaultValue: string
}

interface MarkdownAttribute extends Attribute {
  type: 'markdown',
  defaultValue: string
}

interface RichTextAttribute extends Attribute {
  type: 'richText',
  defaultValue: string
}

interface LinkAttribute extends Attribute {
  type: 'link',
}

interface StorageResourceAttribute extends Attribute {
  type: 'storageResource',
}

interface ComponentsAttribute extends Attribute {
  type: 'component',
  component: string,
  maxComponents: number,
  allowedComponents: Array<string>
}

type attributeValue = BooleanAttribute | NumberAttribute | StringAttribute | TextAttribute | MarkdownAttribute
  | RichTextAttribute | LinkAttribute | StorageResourceAttribute | ComponentsAttribute

interface ComponentSchema {
  version: string,
  attributes: Array<attributeValue>
}

interface ComponentSchemaFile {
  name: string,
  versions: Record<string, ComponentSchema>,
  currentVersion: string
}

interface InputConfig<T extends attributeValue['type']> {
  label: string,
  formControl: typeof Checkbox | typeof Input | typeof NumberInput,
  props: {
    name: T,
    required: boolean,
    disabled: boolean
  },
  value: unknown
}

// pages --------------------------

interface ComponentNode {
  schema: ComponentSchema,
  code?: string,
  data: Record<ComponentSchema['attributes'][number]['name'], unknown>
}

interface SerializedComponentNode extends Omit<ComponentNode, 'schema'> {
  schema: string
}

interface Page {
  name: string,
  previewURL: string,
  contents: ComponentNode,
  lastModified: string
}

interface SerializedPage extends Omit<Page, 'contents'> {
  contents: string
}

export type {
  Attribute,
  BooleanAttribute,
  NumberAttribute,
  StringAttribute,
  TextAttribute,
  MarkdownAttribute,
  RichTextAttribute,
  LinkAttribute,
  StorageResourceAttribute,
  ComponentsAttribute,
  attributeValue,
  ComponentSchema,
  ComponentSchemaFile,
  InputConfig,
  // pages --------------------------
  ComponentNode,
  SerializedComponentNode,
  Page,
  SerializedPage
}
