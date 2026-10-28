import { validator } from '@exodus/schemasafe'
import { DocumentValidationError, type ValidationIssue } from './errors'
import { formats } from './validators'

type JsonSchema = Parameters<typeof validator>[0]
type Validate = ReturnType<typeof validator>

const validators = new WeakMap<object, Validate>()

const validatorOf = (schema: JsonSchema): Validate => {
  const key = schema as object
  let validate = validators.get(key)
  if (validate === undefined) {
    validate = validator(schema, { formats, includeErrors: true, allErrors: true })
    validators.set(key, validate)
  }
  return validate
}

const pathOf = (instanceLocation: string): string => instanceLocation.replace(/^#/, '') || '/'

const issuesOf = (validate: Validate): ValidationIssue[] =>
  (validate.errors ?? []).map(({ instanceLocation, keywordLocation }) => ({
    instancePath: pathOf(instanceLocation),
    keyword: keywordLocation.slice(keywordLocation.lastIndexOf('/') + 1)
  }))

/** DOC-8: throws DocumentValidationError when the document does not match the schema. */
function validateDocument (schema: JsonSchema, document: unknown): void {
  const validate = validatorOf(schema)
  if (!validate(document as never)) throw new DocumentValidationError(issuesOf(validate))
}

export { validateDocument }
