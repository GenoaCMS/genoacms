import type { Checkbox, Input, NumberInput } from 'flowbite-svelte'

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
  type: 'link'
}

interface StorageResourceAttribute extends Attribute {
  type: 'storageResource'
}

interface ComponentsAttribute extends Attribute {
  type: 'component',
  component: string,
  maxComponents: number,
  allowedComponents: Array<string>
}

type attributeValue = BooleanAttribute | NumberAttribute | StringAttribute | TextAttribute | MarkdownAttribute
  | RichTextAttribute | LinkAttribute | StorageResourceAttribute | ComponentsAttribute

interface Component {
  version: string,
  attributes: Record<string, attributeValue>
}

interface InputConfig {
  label: string,
  formControl: Checkbox | Input | NumberInput,
  props: Record<string, boolean | number | string>
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
  Component,
  InputConfig
}
