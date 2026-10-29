class StorageToolError extends Error {
  constructor (code: string, message: string) {
    super(message)
    this.name = 'StorageToolError'
    this.code = code
  }

  readonly code: string
}

const FORBIDDEN_LEVELS = new Set(['', '.', '..'])

const isObjectName = (name: string): boolean =>
  !name.endsWith('/') && name.split('/').every(level => !FORBIDDEN_LEVELS.has(level))

const isDirectoryPath = (path: string): boolean =>
  path === '' || (path.endsWith('/') && isObjectName(path.slice(0, -1)))

const invalidName = (name: string): StorageToolError =>
  new StorageToolError('storage/invalid-name', `storage/invalid-name: ${name}`)

/** TOL-24: throws StorageToolError unless name is an object name. */
function requireObjectName (name: string): void {
  if (!isObjectName(name)) throw invalidName(name)
}

/** TOL-24: throws StorageToolError unless path is a directory path, the root included. */
function requireDirectoryPath (path: string): void {
  if (!isDirectoryPath(path)) throw invalidName(path)
}

/** TOL-28: throws StorageToolError unless path is a directory path other than the root. */
function requireSubdirectoryPath (path: string): void {
  if (path === '' || !isDirectoryPath(path)) throw invalidName(path)
}

export { StorageToolError, requireObjectName, requireDirectoryPath, requireSubdirectoryPath }
