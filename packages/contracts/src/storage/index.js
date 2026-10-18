/**
 * Shared storage-service behavior that is not adapter-specific.
 *
 * Object storage offers no cross-object atomicity, so GenoaCMS does not pretend to transactions.
 * What every platform does provide is a **conditional write** on a single object, and that is
 * enough for the problem storage-first actually has: two writers who both read an object and both
 * write it back, the second silently erasing the first.
 */

/**
 * Raised when a conditional write was refused because the object was not in the expected state.
 *
 * This is an ordinary outcome, not a fault. A caller that supplied `ifVersion` and sees this has
 * lost a race and should re-read and decide — for a document a person is editing, that means
 * reporting a conflict rather than replaying the write, since a blind retry would reintroduce the
 * lost update the condition exists to prevent.
 */
class PreconditionFailedError extends Error {
  /**
   * @param {import('./types.d.ts').ObjectReference} reference
   * @param {string} reason
   */
  constructor (reference, reason) {
    super(`storage/precondition-failed: ${reference.bucket}/${reference.name}: ${reason}`)
    this.name = 'PreconditionFailedError'
    this.reference = reference
    this.reason = reason
  }
}

/**
 * Matches on the name rather than with `instanceof`, so a caller still recognizes the error when
 * an adapter has resolved its own copy of this module.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isPreconditionFailed (error) {
  return typeof error === 'object' &&
    error !== null &&
    /** @type {{ name?: unknown }} */ (error).name === 'PreconditionFailedError'
}

/**
 * Raised when `getObject` or `deleteObject` is given an object that does not exist (STOR-16).
 */
class ObjectNotFoundError extends Error {
  /**
   * @param {import('./types.d.ts').ObjectReference} reference
   */
  constructor (reference) {
    super(`storage/not-found: ${reference.bucket}/${reference.name}`)
    this.name = 'ObjectNotFoundError'
    this.reference = reference
  }
}

/**
 * Raised when a directory method is given a name that is not a directory name (STOR-3).
 */
class NotADirectoryError extends Error {
  /**
   * @param {import('./types.d.ts').ObjectReference} reference
   */
  constructor (reference) {
    super(`storage/not-a-directory: ${reference.bucket}/${reference.name}`)
    this.name = 'NotADirectoryError'
    this.reference = reference
  }
}

/**
 * @param {unknown} error
 * @param {string} name
 * @returns {boolean}
 */
const isErrorNamed = (error, name) =>
  typeof error === 'object' && error !== null && /** @type {{ name?: unknown }} */ (error).name === name

/**
 * Matches on the name, as `isPreconditionFailed` does (CD11).
 *
 * @param {unknown} error
 * @returns {boolean}
 */
const isNotFound = (error) => isErrorNamed(error, 'ObjectNotFoundError')

/**
 * `''`, the root, or a name ending in `/` (STOR-3).
 *
 * @param {string} name
 * @returns {boolean}
 */
const isDirectoryName = (name) => name === '' || name.endsWith('/')

export {
  PreconditionFailedError,
  isPreconditionFailed,
  ObjectNotFoundError,
  isNotFound,
  NotADirectoryError,
  isDirectoryName
}
