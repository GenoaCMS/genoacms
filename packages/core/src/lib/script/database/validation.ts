import { validator } from '@exodus/schemasafe'
import { WILDCARD } from '$lib/script/authorization/grants'
import type { PermittedFields } from '$lib/script/authorization/fields'
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

const parentPath = (path: string): string => path.slice(0, path.lastIndexOf('/')) || '/'

const issueOf = ({ instanceLocation, keywordLocation }: { instanceLocation: string, keywordLocation: string }): ValidationIssue => {
  const keyword = keywordLocation.slice(keywordLocation.lastIndexOf('/') + 1)
  const path = pathOf(instanceLocation)
  return { instancePath: keyword === 'required' ? parentPath(path) : path, keyword }
}

const issuesOf = (validate: Validate): ValidationIssue[] => (validate.errors ?? []).map(issueOf)

const HIDDEN_FIELDS: ValidationIssue = { instancePath: 'hidden', keyword: 'fields' }

const topLevelField = (instancePath: string): string | undefined => {
  const segment = instancePath.split('/')[1]
  return segment === undefined || segment === '' ? undefined : segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

const isHidden = (issue: ValidationIssue, readable: PermittedFields): boolean => {
  const field = topLevelField(issue.instancePath)
  return readable !== WILDCARD && field !== undefined && !readable.includes(field)
}

const describedIssues = (issues: ValidationIssue[], readable: PermittedFields): ValidationIssue[] => {
  const visible = issues.filter(issue => !isHidden(issue, readable))
  return visible.length === issues.length ? visible : [...visible, HIDDEN_FIELDS]
}

/** DOC-8, OU7: throws DocumentValidationError when the document does not match the schema. */
function validateDocument (schema: JsonSchema, document: unknown, readable: PermittedFields): void {
  const validate = validatorOf(schema)
  if (!validate(document as never)) throw new DocumentValidationError(describedIssues(issuesOf(validate), readable))
}

export { validateDocument }
