interface ValidationIssue {
  instancePath: string
  keyword: string
}

class DocumentValidationError extends Error {
  readonly errors: ValidationIssue[]

  constructor (errors: ValidationIssue[]) {
    super('documents/invalid: ' + errors.map(({ instancePath, keyword }) => `${instancePath || '/'} ${keyword}`).join('; '))
    this.name = 'DocumentValidationError'
    this.errors = errors
  }
}

class DocumentNotFoundError extends Error {
  constructor (collection: string, id: string) {
    super(`documents/not-found: ${collection}/${id}`)
    this.name = 'DocumentNotFoundError'
  }
}

export { DocumentValidationError, DocumentNotFoundError }
export type { ValidationIssue }
