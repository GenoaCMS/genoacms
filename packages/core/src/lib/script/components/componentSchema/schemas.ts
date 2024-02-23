import type { JSONSchemaType } from 'ajv'
import type {
  attributeValue,
  BooleanAttribute,
  ComponentSchema,
  ComponentsAttribute,
  InputConfig,
  LinkAttribute,
  MarkdownAttribute,
  NumberAttribute,
  RichTextAttribute,
  StorageResourceAttribute,
  StringAttribute,
  TextAttribute, ComponentSchemaFile
} from './types'
import type { PartialSchema } from 'ajv/dist/types/json-schema'
import { Checkbox, Input, NumberInput } from 'flowbite-svelte'

const booleanAttributeSchema: JSONSchemaType<BooleanAttribute> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'boolean'
    },
    defaultValue: { type: 'boolean' }
  },
  required: ['name', 'type']
}

const numberAttributeSchema: JSONSchemaType<NumberAttribute> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'number'
    },
    defaultValue: { type: 'number' },
    min: { type: 'number' },
    max: { type: 'number' },
    step: { type: 'number' },
    decimalPlaces: { type: 'number' }
  },
  required: ['name', 'type']
}

const stringAttributeSchema: JSONSchemaType<StringAttribute> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'string'
    },
    defaultValue: { type: 'string' },
    regex: { type: 'string' },
    maxLength: { type: 'number' }
  },
  required: ['name', 'type']
}

const textAttributeSchema: JSONSchemaType<TextAttribute> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'text'
    },
    defaultValue: { type: 'string' },
    maxLength: { type: 'number' }
  },
  required: ['name', 'type']
}

const markdownAttributeSchema: JSONSchemaType<MarkdownAttribute> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'markdown'
    },
    defaultValue: { type: 'string' }
  },
  required: ['name', 'type']
}

const richTextAttributeSchema: JSONSchemaType<RichTextAttribute> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'richText'
    },
    defaultValue: { type: 'string' }
  },
  required: ['name', 'type']
}

const linkAttributeSchema: JSONSchemaType<LinkAttribute> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'link'
    }
  },
  required: ['name', 'type']
}

const storageResourceAttributeSchema: JSONSchemaType<StorageResourceAttribute> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'storageResource'
    }
  },
  required: ['name', 'type']
}

const componentsAttributeSchema: JSONSchemaType<ComponentsAttribute> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'components'
    },
    component: { type: 'string' },
    maxComponents: { type: 'number' },
    allowedComponents: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['name', 'type']
}

const componentSchemaSchema: JSONSchemaType<ComponentSchema> = {
  type: 'object',
  properties: {
    version: { type: 'string' },
    attributes: {
      type: 'array',
      items: {
        oneOf: [
          booleanAttributeSchema,
          numberAttributeSchema,
          stringAttributeSchema,
          textAttributeSchema,
          markdownAttributeSchema,
          richTextAttributeSchema,
          linkAttributeSchema,
          storageResourceAttributeSchema,
          componentsAttributeSchema
        ]
      }
    }
  },
  required: ['version', 'attributes']
}

const componentSchemaFileSchema: JSONSchemaType<ComponentSchemaFile> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    versions: {
      type: 'object',
      additionalProperties: componentSchemaSchema,
      required: []
    },
    currentVersion: { type: 'string' }
  },
  required: ['name', 'versions', 'currentVersion']
}

const getAttributeTypes = (): Array<attributeValue['type']> => componentSchemaSchema.properties.attributes.items.oneOf
  .map((schema: JSONSchemaType<attributeValue>) => schema.properties.type.const)
const getAttributeSchemaByType = (type: string): JSONSchemaType<attributeValue> => componentSchemaSchema.properties
  .attributes.items.oneOf
  .find((schema: JSONSchemaType<attributeValue>) => schema.properties.type.const === type)
const attributeToHTMLInputConfig = (name: attributeValue['type'], attribute: PartialSchema<Extract<attributeValue,
  { type: typeof name }>>, isRequired: boolean): InputConfig<typeof name> => {
  const label = name
  let formControl: typeof Checkbox | typeof Input | typeof NumberInput
  let fallbackValue
  const props = {
    name,
    required: isRequired,
    disabled: !!attribute.const
  }

  switch (attribute.type) {
    case 'boolean':
      formControl = Checkbox
      fallbackValue = Boolean()
      break
    case 'number':
      formControl = NumberInput
      fallbackValue = Number()
      break
    case 'array':
      fallbackValue = []
      formControl = Input
      break
    case 'string':
    default:
      fallbackValue = String()
      formControl = Input
      break
  }

  return {
    value: attribute.const ?? fallbackValue,
    label,
    formControl,
    props
  }
}

const booleanValueSchema: JSONSchemaType<boolean> = {
  type: 'boolean'
}

const numberValueSchema: JSONSchemaType<number> = {
  type: 'number'
}

const stringValueSchema: JSONSchemaType<string> = {
  type: 'string'
}

const componentsValueSchema: JSONSchemaType<Array<string>> = {
  type: 'array',
  items: {
    type: 'string',
    enum: []
  }
}

export {
  booleanAttributeSchema,
  numberAttributeSchema,
  stringAttributeSchema,
  textAttributeSchema,
  markdownAttributeSchema,
  richTextAttributeSchema,
  linkAttributeSchema,
  storageResourceAttributeSchema,
  componentsAttributeSchema,
  componentSchemaSchema,
  componentSchemaFileSchema,
  getAttributeTypes,
  getAttributeSchemaByType,
  attributeToHTMLInputConfig,
  booleanValueSchema,
  numberValueSchema,
  stringValueSchema,
  componentsValueSchema
}
