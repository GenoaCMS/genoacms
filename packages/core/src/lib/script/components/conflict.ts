import { isPreconditionFailed, type UploadOptions } from '@genoacms/contracts/storage'

/** HIS-2 */
class ConflictError extends Error {
  constructor (readonly object: string, readonly version: string) {
    super(`conflict/modified-since: ${object} has changed since version ${version}; read it again.`)
    this.name = 'ConflictError'
  }
}

/** HIS-2 */
class UnversionedError extends Error {
  constructor (readonly object: string) {
    super(`storage/unversioned: ${object} was read without a version and cannot be saved.`)
    this.name = 'UnversionedError'
  }
}

const isConflict = (error: unknown): error is ConflictError => error instanceof ConflictError

const isVersioned = (version: string | undefined): version is string => version !== undefined && version !== ''

/** HIS-2: runs `write` on condition that `object` still has `version`; a lost race is a `ConflictError`. */
async function writeConditionally (
  write: (options: UploadOptions) => Promise<void>,
  object: string,
  version: string | undefined
): Promise<void> {
  if (!isVersioned(version)) throw new UnversionedError(object)
  try {
    await write({ ifVersion: version })
  } catch (error) {
    if (isPreconditionFailed(error)) throw new ConflictError(object, version)
    throw error
  }
}

/** HIS-2: a step that writes nothing still refuses a version the object no longer has. */
function requireCurrent (object: string, version: string | undefined, current: string | undefined): void {
  if (!isVersioned(version)) throw new UnversionedError(object)
  if (version !== current) throw new ConflictError(object, version)
}

export { ConflictError, UnversionedError, isConflict, writeConditionally, requireCurrent }
