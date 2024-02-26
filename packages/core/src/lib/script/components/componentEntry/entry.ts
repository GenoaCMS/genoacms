import type { JSONSchemaType } from 'ajv'
import type {
  InputConfig
} from './types'
import type { PartialSchema } from 'ajv/dist/types/json-schema'
import { Checkbox, Input, NumberInput } from 'flowbite-svelte'
import { componentEntryAttributesSchema } from '$lib/script/components/componentEntry/component/schemas'
import type { Attribute, AttributeType } from '$lib/script/components/componentEntry/component/types'

const getAttributeTypes = (): Array<AttributeType> => componentEntryAttributesSchema.additionalProperties.oneOf
  .map((schema: JSONSchemaType<Attribute>) => schema.properties.type.const)
const getAttributeSchemaByType = (type: string): JSONSchemaType<Attribute> => componentEntryAttributesSchema
  .additionalProperties.oneOf
  .find((schema: JSONSchemaType<Attribute>) => schema.properties.type.const === type)
const attributeToHTMLInputConfig = (name: AttributeType,
  attribute: PartialSchema<Extract<Attribute, { type: typeof name }>>,
  isRequired: boolean): InputConfig<typeof name> => {
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
