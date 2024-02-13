import { Checkbox, Input, NumberInput } from 'flowbite-svelte'

interface Attribute {
  name: string,
  description: string,
  isRequired: boolean
}

interface BooleanAttribute extends Attribute {
  type: 'boolean',
  dataType: 'boolean',
  defaultValue: boolean
}

interface NumberAttribute extends Attribute {
  type: 'number',
  dataType: 'number',
  min: number,
  max: number,
  defaultValue: number,
  step: number,
  decimalPlaces: number
}

interface StringAttribute extends Attribute {
  type: 'string',
  dataType: 'string',
  regex: string,
  maxLength: number,
  defaultValue: string
}

interface TextAttribute extends Attribute {
  type: 'text',
  dataType: 'string',
  maxLength: number,
  defaultValue: string
}

interface MarkdownAttribute extends Attribute {
  type: 'markdown',
  dataType: 'string',
  defaultValue: string
}

interface RichTextAttribute extends Attribute {
  type: 'richText',
  dataType: 'string',
  defaultValue: string
}

interface LinkAttribute extends Attribute {
  type: 'link',
  dataType: 'string'
}

interface StorageResourceAttribute extends Attribute {
  type: 'storageResource',
  dataType: 'string'
}

interface ComponentsAttribute extends Attribute {
  type: 'component',
  dataType: {
    type: 'array',
    items: 'string'
  },
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

type attributeData = attributeValue['dataType']

interface ComponentNode {
  schema: ComponentSchema,
  code?: string,
  data: Record<ComponentSchema['attributes'][number]['name'], attributeData>
}

interface SerialzedComponentNode extends ComponentNode {
  schema: string
}

interface Page {
  name: string,
  components: Array<ComponentNode>,
  lastModified: string
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
  SerialzedComponentNode,
  Page
}
