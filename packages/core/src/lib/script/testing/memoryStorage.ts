import { Readable } from 'node:stream'
import { PreconditionFailedError } from '@genoacms/contracts/storage'
import type { DirectoryContents, ObjectPayload, ObjectReference, UploadOptions } from '@genoacms/contracts/storage'
import type { Parsed } from './requests'

interface StoredObject {
  text: string
  version: string
  lastModified: Date
}

interface MemoryState { objects: Map<string, StoredObject>, directories: Set<string>, versions: number }

const state: MemoryState = ((globalThis as Parsed).__genoacmsMemoryStorage ??= { objects: new Map(), directories: new Set(), versions: 0 })
const { objects, directories } = state

const keyOf = ({ bucket, name }: ObjectReference): string => `${bucket}/${name}`

function notFound (reference: ObjectReference): never {
  throw new Error(`storage/not-found: ${keyOf(reference)}`)
}

function payloadText (data: ObjectPayload): string {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  throw new Error('memory storage accepts strings and buffers only')
}

function put (reference: ObjectReference, text: string, options: UploadOptions = {}): void {
  const existing = objects.get(keyOf(reference))
  if (options.ifAbsent === true && existing !== undefined) throw new PreconditionFailedError(reference, 'exists')
  if (options.ifVersion !== undefined && existing?.version !== options.ifVersion) throw new PreconditionFailedError(reference, 'version mismatch')
  objects.set(keyOf(reference), { text, version: `v${++state.versions}`, lastModified: new Date() })
}

function withPrefix (name: string): string {
  return name === '' || name.endsWith('/') ? name : `${name}/`
}

function list (reference: ObjectReference): DirectoryContents {
  const prefix = keyOf({ bucket: reference.bucket, name: withPrefix(reference.name) })
  const contents: DirectoryContents = { files: [], directories: [] }
  const seen = new Set<string>()
  for (const [key, stored] of objects) {
    if (!key.startsWith(prefix)) continue
    const rest = key.slice(prefix.length)
    const slash = rest.indexOf('/')
    const name = key.slice(reference.bucket.length + 1)
    if (slash === -1) {
      contents.files.push({ name, size: stored.text.length, lastModified: stored.lastModified })
      continue
    }
    const directory = name.slice(0, name.length - rest.length + slash + 1)
    if (seen.has(directory)) continue
    seen.add(directory)
    contents.directories.push({ bucket: reference.bucket, name: directory })
  }
  return contents
}

/** The storage providers module, backed by memory, honoring `ifVersion` and `ifAbsent`. */
const memoryProviders = {
  getObject: async (reference: ObjectReference) => {
    const stored = objects.get(keyOf(reference)) ?? notFound(reference)
    return { data: Readable.from([stored.text]), version: stored.version }
  },
  uploadObject: async (reference: ObjectReference, data: ObjectPayload, options?: UploadOptions) => {
    put(reference, payloadText(data), options)
  },
  moveObject: async (reference: ObjectReference, newPath: string) => {
    const stored = objects.get(keyOf(reference)) ?? notFound(reference)
    objects.delete(keyOf(reference))
    put({ bucket: reference.bucket, name: newPath }, stored.text)
  },
  deleteObject: async (reference: ObjectReference) => {
    if (!objects.delete(keyOf(reference))) notFound(reference)
  },
  getPublicURL: async (reference: ObjectReference) => `https://storage.test/${keyOf(reference)}`,
  getSignedURL: async (reference: ObjectReference) => `https://storage.test/${keyOf(reference)}?signed`,
  listDirectory: async (reference: ObjectReference) => list(reference),
  createDirectory: async (reference: ObjectReference) => { directories.add(keyOf(reference)) },
  moveDirectory: async (reference: ObjectReference, newPath: string) => {
    const prefix = keyOf({ bucket: reference.bucket, name: withPrefix(reference.name) })
    for (const [key, stored] of [...objects]) {
      if (!key.startsWith(prefix)) continue
      objects.delete(key)
      put({ bucket: reference.bucket, name: withPrefix(newPath) + key.slice(prefix.length) }, stored.text)
    }
  },
  deleteDirectory: async (reference: ObjectReference) => {
    const prefix = keyOf({ bucket: reference.bucket, name: withPrefix(reference.name) })
    for (const key of [...objects.keys()]) if (key.startsWith(prefix)) objects.delete(key)
  }
}

/** What a test reads and arranges in the default bucket, `genoacms` in `genoa.config/test.ts`. */
const memory = {
  bucket: 'genoacms',
  clear (): void {
    objects.clear()
    directories.clear()
  },
  names (): string[] {
    return [...objects.keys()].filter(key => key.startsWith(`${memory.bucket}/`)).map(key => key.slice(memory.bucket.length + 1))
  },
  has (name: string): boolean {
    return objects.has(`${memory.bucket}/${name}`)
  },
  text (name: string): string | undefined {
    return objects.get(`${memory.bucket}/${name}`)?.text
  },
  json (name: string): Parsed {
    const text = memory.text(name)
    return text === undefined ? undefined : JSON.parse(text)
  },
  versionOf (name: string): string | undefined {
    return objects.get(`${memory.bucket}/${name}`)?.version
  },
  set (name: string, text: string): void {
    put({ bucket: memory.bucket, name }, text)
  },
  snapshot (): Map<string, string> {
    return new Map([...objects].map(([key, stored]) => [key, stored.text]))
  },
  allText (): string {
    return [...objects.values()].map(stored => stored.text).join('\n')
  }
}

export { memoryProviders, memory }
