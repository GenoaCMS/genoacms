import Ajv from 'ajv'
import { prebuiltComponentEntrySchema } from '$lib/script/components/componentEntry/component/schemas'

const ajv = new Ajv()
const validatePrebuiltComponentEntry = ajv.compile(prebuiltComponentEntrySchema)

export {
  validatePrebuiltComponentEntry
}
