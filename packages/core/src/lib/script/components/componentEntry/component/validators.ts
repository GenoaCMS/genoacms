import Ajv from 'ajv'
import {
  componentEntryAttributesSchema
} from '$lib/script/components/componentEntry/component/schemas'

const ajv = new Ajv()
const validateComponentEntryAttributes = ajv.compile(componentEntryAttributesSchema)

export {
  validateComponentEntryAttributes
}
