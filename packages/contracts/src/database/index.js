/**
 * Raised when `updateDocument` is given a document that does not exist (DATA-6, DATA-12).
 */
class DocumentNotFoundError extends Error {
  /**
   * @param {{ collection: { name: string }, id: string }} reference
   */
  constructor (reference) {
    super(`database/not-found: ${reference.collection.name}/${reference.id}`)
    this.name = 'DocumentNotFoundError'
    this.reference = reference
  }
}

/**
 * Raised when the store refuses a query until it is configured for it (DATA-11, DATA-12).
 */
class UnsupportedQueryError extends Error {
  /**
   * @param {string} reason
   */
  constructor (reason) {
    super(`database/unsupported-query: ${reason}`)
    this.name = 'UnsupportedQueryError'
    this.reason = reason
  }
}

/**
 * Matches on the name rather than with `instanceof`, so a caller still recognizes the error when
 * an adapter has resolved its own copy of this module (DATA-12).
 *
 * @param {unknown} error
 * @returns {boolean}
 */
const isDocumentNotFound = (error) =>
  typeof error === 'object' && error !== null && /** @type {{ name?: unknown }} */ (error).name === 'DocumentNotFoundError'

export {
  DocumentNotFoundError,
  UnsupportedQueryError,
  isDocumentNotFound
}
