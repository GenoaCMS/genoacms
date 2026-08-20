import type { DirectoryContents } from '@genoacms/cloudabstraction/storage'

/**
 * Pure helpers over storage names and listings.
 *
 * Separate from both storage services because they touch nothing: no adapter, no bucket, no
 * `AuthContext`. Keeping them here lets the unprivileged internal layer and the access-controlled
 * user-facing layer share them without either importing the other.
 */

const fullyQualifiedNameToPath = (name: string): string => {
  const lastIndexOfSlash = name.lastIndexOf('/')
  return lastIndexOfSlash === -1 ? name : name.slice(0, lastIndexOfSlash)
}

const fullyQualifiedNameToFilename = (name: string): string => {
  if (name[name.length - 1] === '/') name = name.slice(0, -1)

  const lastIndexOfSlash = name.lastIndexOf('/')
  return lastIndexOfSlash === -1 ? name : name.slice(lastIndexOfSlash + 1)
}

const isDirectoryExisting = (directory: DirectoryContents): boolean => {
  return directory.directories.length > 0 || directory.files.length > 0
}

export {
  fullyQualifiedNameToPath,
  fullyQualifiedNameToFilename,
  isDirectoryExisting
}
