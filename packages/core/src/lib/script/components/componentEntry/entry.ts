import type { JSONSchemaType } from 'ajv'
import type {
  attributeValue,
  InputConfig
} from './types'
import type { PartialSchema } from 'ajv/dist/types/json-schema'
import { Checkbox, Input, NumberInput } from 'flowbite-svelte'
import { componentSchemaSchema } from '$lib/script/components/componentEntry/schemas'

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

export {
  getAttributeTypes,
  getAttributeSchemaByType,
  attributeToHTMLInputConfig
}
