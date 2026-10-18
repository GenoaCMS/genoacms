import type { ObjectReference } from '@genoacms/contracts/storage'

// BRW-2
const levelsOf = (directory: string): string[] => directory.match(/[^/]*\//g) ?? []

// BRW-2
const directoryOfRoute = (path: string, delimiter: string): string =>
  path.split(delimiter).filter(level => level !== '').join('')

// BRW-2
const routeOfDirectory = (bucket: string, directory: string, delimiter: string): string =>
  directory === ''
    ? `/storage/${bucket}/contents`
    : `/storage/${bucket}/${levelsOf(directory).map(level => `${delimiter}${level}`).join('')}/contents`

// BRW-13
const isAcceptedName = (name: string, delimiter: string): boolean =>
  name !== '' && name !== '.' && name !== '..' && !name.includes('/') && !name.includes(delimiter)

const isReference = (value: unknown): value is ObjectReference =>
  typeof value === 'object' && value !== null &&
  typeof (value as ObjectReference).bucket === 'string' && typeof (value as ObjectReference).name === 'string'

const parseJSON = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// BRW-11
const parseContents = (value: FormDataEntryValue | null): ObjectReference[] | undefined => {
  if (typeof value !== 'string') return undefined
  const parsed = parseJSON(value)
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isReference)) return undefined
  return parsed.map(({ bucket, name }) => ({ bucket, name }))
}

const withoutTrailingSlash = (name: string): string => name.endsWith('/') ? name.slice(0, -1) : name

const parentOf = (name: string): string => {
  const trimmed = withoutTrailingSlash(name)
  return trimmed.slice(0, trimmed.lastIndexOf('/') + 1)
}

const lastLevelOf = (name: string): string => name.slice(parentOf(name).length)

const isDirectoryReference = (name: string): boolean => name.endsWith('/')

export {
  directoryOfRoute,
  routeOfDirectory,
  isAcceptedName,
  parseContents,
  parentOf,
  lastLevelOf,
  isDirectoryReference
}
