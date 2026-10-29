import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import * as contracts from '@genoacms/contracts/storage'

/**
 * In-memory adapters. They exist to prove the suites *run* against a correct implementation; they
 * are not a reference implementation of either service.
 */

const LISTING_MAXIMUM = 1000

async function bytesOf (data) {
  if (typeof data === 'string') return Buffer.from(data)
  if (Buffer.isBuffer(data)) return Buffer.from(data)
  const chunks = []
  for await (const chunk of data) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

const encodeToken = (name) => Buffer.from(name, 'utf8').toString('base64url')
const decodeToken = (token) => Buffer.from(token, 'base64url').toString('utf8')

/**
 * @param {string[]} buckets the buckets the provider was given
 * @returns {import('@genoacms/contracts/storage').Adapter}
 */
function memoryStorage (buckets = ['b']) {
  const stores = new Map(buckets.map(bucket => [bucket, { objects: new Map(), directories: new Set() }]))

  const storeOf = ({ bucket }) => {
    const store = stores.get(bucket)
    if (store === undefined) throw new Error('bucket-unregistered')
    return store
  }
  const isDirectoryName = (name) => name === '' || name.endsWith('/')
  const requireDirectory = (bucket, name, { root = true } = {}) => {
    if (!isDirectoryName(name) || (!root && name === '')) throw new contracts.NotADirectoryError({ bucket, name })
  }
  const namesUnder = (store, prefix) => [...store.objects.keys(), ...store.directories].filter(name => name.startsWith(prefix))
  const entriesIn = (store, directory) => {
    const files = new Map()
    const directories = new Set()
    for (const [name, object] of store.objects) {
      if (!name.startsWith(directory) || name === directory) continue
      const rest = name.slice(directory.length)
      const slash = rest.indexOf('/')
      if (slash === -1) files.set(name, object)
      else directories.add(directory + rest.slice(0, slash + 1))
    }
    for (const name of store.directories) {
      const rest = name.slice(directory.length)
      if (!name.startsWith(directory) || rest === '') continue
      directories.add(directory + rest.slice(0, rest.indexOf('/') + 1))
    }
    return [
      ...[...files].map(([name, object]) => ({ name, object })),
      ...[...directories].map(name => ({ name }))
    ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  }
  const relocate = (store, name, destination) => {
    if (store.objects.has(name)) {
      store.objects.set(destination, store.objects.get(name))
      store.objects.delete(name)
    } else {
      store.directories.delete(name)
      store.directories.add(destination)
    }
  }

  return {
    async getObject (reference) {
      const object = storeOf(reference).objects.get(reference.name)
      if (object === undefined) throw new contracts.ObjectNotFoundError(reference)
      return { data: Readable.from([Buffer.from(object.bytes)]), version: object.version }
    },
    async getSignedURL (reference) { storeOf(reference); return `memory://${reference.bucket}/${reference.name}?signed` },
    async getPublicURL (reference) { storeOf(reference); return `memory://${reference.bucket}/${reference.name}` },
    async uploadObject (reference, data, options = {}) {
      const store = storeOf(reference)
      const bytes = await bytesOf(data)
      const existing = store.objects.get(reference.name)
      if (options.ifAbsent === true) {
        if (existing !== undefined) throw new contracts.PreconditionFailedError(reference, 'object already exists')
      } else if (options.ifVersion !== undefined && existing?.version !== options.ifVersion) {
        throw new contracts.PreconditionFailedError(reference, 'object changed since it was read')
      }
      store.objects.set(reference.name, { bytes, lastModified: new Date(), version: randomUUID() })
    },
    async moveObject (reference, destination) {
      const store = storeOf(reference)
      if (!store.objects.has(reference.name)) throw new contracts.ObjectNotFoundError(reference)
      relocate(store, reference.name, destination)
    },
    async deleteObject (reference) {
      const store = storeOf(reference)
      if (!store.objects.delete(reference.name)) throw new contracts.ObjectNotFoundError(reference)
    },
    async listDirectory (reference, params = {}) {
      const store = storeOf(reference)
      requireDirectory(reference.bucket, reference.name)
      const after = [params.startAfter, params.pageToken === undefined ? undefined : decodeToken(params.pageToken)]
        .filter(name => name !== undefined)
      const remaining = entriesIn(store, reference.name).filter(entry => after.every(name => entry.name > name))
      const page = remaining.slice(0, params.limit ?? LISTING_MAXIMUM)
      const listing = {
        files: page.filter(entry => entry.object !== undefined)
          .map(({ name, object }) => ({ name, size: object.bytes.length, lastModified: object.lastModified })),
        directories: page.filter(entry => entry.object === undefined).map(({ name }) => ({ bucket: reference.bucket, name }))
      }
      if (page.length < remaining.length) listing.next = encodeToken(page.at(-1).name)
      return listing
    },
    async createDirectory (reference) {
      const store = storeOf(reference)
      requireDirectory(reference.bucket, reference.name, { root: false })
      store.directories.add(reference.name)
    },
    async deleteDirectory (reference) {
      const store = storeOf(reference)
      requireDirectory(reference.bucket, reference.name, { root: false })
      for (const name of namesUnder(store, reference.name)) {
        store.objects.delete(name)
        store.directories.delete(name)
      }
    },
    async moveDirectory (reference, destination) {
      const store = storeOf(reference)
      requireDirectory(reference.bucket, reference.name, { root: false })
      requireDirectory(reference.bucket, destination)
      for (const name of namesUnder(store, reference.name)) relocate(store, name, destination + name.slice(reference.name.length))
    }
  }
}

const OPERATORS = ['==', '!=', '<', '<=', '>', '>=']
const invalidQuery = (reason) => new Error(`database/invalid-query: ${reason}`)

class DocumentNotFoundError extends Error {
  constructor (reference) {
    super(`database/not-found: ${reference.collection.name}/${reference.id}`)
    this.name = 'DocumentNotFoundError'
  }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)

const MAXIMUM_DIGITS = 38
const SMALLEST_MAGNITUDE = 1e-130
const LARGEST_MAGNITUDE = 1e126

const significantDigits = (number) => String(number).split('e')[0].replace(/[^0-9]/g, '').replace(/^0+|0+$/g, '').length
const isHoldableNumber = (number) => Number.isFinite(number) &&
  (number === 0 || (Math.abs(number) >= SMALLEST_MAGNITUDE && Math.abs(number) <= LARGEST_MAGNITUDE && significantDigits(number) <= MAXIMUM_DIGITS))
const isHoldableString = (text) => text.isWellFormed() && !text.includes('\u0000')

function unsupportedPath (value, path, ancestors = new Set()) {
  if (value === null || typeof value === 'boolean') return undefined
  if (typeof value === 'string') return isHoldableString(value) ? undefined : path
  if (typeof value === 'number') return isHoldableNumber(value) ? undefined : path
  if (ancestors.has(value)) return path
  if (Array.isArray(value)) return unsupportedItem(value, path, [...ancestors, value])
  if (isPlainObject(value)) return unsupportedField(value, path, [...ancestors, value])
  return path
}

function unsupportedItem (array, path, ancestors) {
  if (Object.keys(array).length !== array.length) return path
  for (const [index, element] of array.entries()) {
    if (Array.isArray(element)) return [...path, index]
    const found = unsupportedPath(element, [...path, index], new Set(ancestors))
    if (found !== undefined) return found
  }
  return undefined
}

function unsupportedField (object, path, ancestors) {
  for (const [field, element] of Object.entries(object)) {
    if (element === undefined) continue
    const found = unsupportedPath(element, [...path, field], new Set(ancestors))
    if (found !== undefined) return found
  }
  return undefined
}

function checkValues (data) {
  const path = unsupportedPath(data, [])
  if (path !== undefined) throw new Error(`database/unsupported-value: ${path.join('.')}`)
}

const withoutUndefined = (data) => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))

const jsonTypeOf = (value) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
const COMPARABLE_TYPES = ['null', 'number', 'string', 'boolean']

function compareValues (a, b) {
  if (typeof a === 'string') return Buffer.compare(Buffer.from(a), Buffer.from(b))
  return Number(a) - Number(b)
}

function holds (actual, { operator, value }) {
  const type = jsonTypeOf(value)
  if (!COMPARABLE_TYPES.includes(type) || jsonTypeOf(actual) !== type) return false
  if (type === 'null') return operator === '=='
  const order = compareValues(actual, value)
  return { '==': order === 0, '!=': order !== 0, '<': order < 0, '<=': order <= 0, '>': order > 0, '>=': order >= 0 }[operator]
}

const matches = (data, conditions) => conditions.every(condition => Object.hasOwn(data, condition.field) && holds(data[condition.field], condition))

function checkCondition (condition) {
  if (!isPlainObject(condition)) throw invalidQuery('a condition is not an object')
  if (typeof condition.field !== 'string') throw invalidQuery('a condition field is not a string')
  if (!OPERATORS.includes(condition.operator)) throw invalidQuery(`unknown operator ${String(condition.operator)}`)
  const { value } = condition
  const comparable = value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
  if (!comparable) throw invalidQuery(`the value of ${condition.field} is not a string, a number, a boolean or null`)
}

const PARAMETERS = ['where', 'limit', 'pageToken']
const LIMIT_MAXIMUM = 1000

function checkQuery (params) {
  if (!isPlainObject(params)) throw invalidQuery('the parameters are not an object')
  const unknown = Object.keys(params).find(name => !PARAMETERS.includes(name))
  if (unknown !== undefined) throw invalidQuery(`unknown parameter ${unknown}`)
  if (params.where !== undefined) {
    if (!Array.isArray(params.where) || Object.keys(params.where).length !== params.where.length) throw invalidQuery('where is not a dense array')
    params.where.forEach(checkCondition)
  }
  if (params.limit !== undefined && !(Number.isInteger(params.limit) && params.limit >= 1 && params.limit <= LIMIT_MAXIMUM)) throw invalidQuery('limit is not an integer from 1 to 1000')
  if (params.pageToken !== undefined && typeof params.pageToken !== 'string') throw invalidQuery('pageToken is not a string')
}

const encodePageToken = (id) => Buffer.from(JSON.stringify({ id })).toString('base64url')
function decodePageToken (token) {
  try {
    const { id } = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'))
    if (typeof id === 'string') return id
  } catch {}
  throw invalidQuery('unknown page token')
}

const byIdentifier = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))

/**
 * @param {{ assignId?: (data: object, key: string) => string }} options only the mutants of the suite pass it
 * @returns {import('@genoacms/contracts/database').Adapter}
 */
function memoryDatabase ({ assignId = () => randomUUID() } = {}) {
  /** @type {Map<string, Map<string, object>>} */
  const collections = new Map()
  const collectionOf = (name) => {
    if (!collections.has(name)) collections.set(name, new Map())
    return collections.get(name)
  }
  const snapshotOf = (collection, id, data) => ({ reference: { collection, id }, data: structuredClone(data) })

  return {
    async createDocument (reference, document) {
      const key = reference.primaryKey.key
      const { [key]: _ignored, ...given } = document
      checkValues(given)
      const id = assignId(document, key)
      const data = { ...withoutUndefined(given), [key]: id }
      collectionOf(reference.name).set(id, structuredClone(data))
      return snapshotOf(reference, id, data)
    },
    async getCollection (reference, params = {}) {
      checkQuery(params)
      const after = params.pageToken === undefined ? undefined : decodePageToken(params.pageToken)
      const candidates = [...collectionOf(reference.name).entries()]
        .filter(([id]) => after === undefined || byIdentifier(id, after) > 0)
        .filter(([, data]) => matches(data, params.where ?? []))
        .sort(([a], [b]) => byIdentifier(a, b))
      const page = params.limit === undefined ? candidates : candidates.slice(0, params.limit)
      const documents = page.map(([id, data]) => snapshotOf(reference, id, data))
      return candidates.length > page.length ? { documents, next: encodePageToken(page.at(-1)[0]) } : { documents }
    },
    async getDocument (reference) {
      const data = collectionOf(reference.collection.name).get(reference.id)
      return data === undefined ? undefined : snapshotOf(reference.collection, reference.id, data)
    },
    async updateDocument (reference, document) {
      const key = reference.collection.primaryKey.key
      if (document[key] !== undefined && document[key] !== reference.id) throw new Error(`database/key-immutable: ${key}`)
      const { [key]: _ignored, ...given } = document
      checkValues(given)
      const stored = collectionOf(reference.collection.name).get(reference.id)
      if (stored === undefined) throw new DocumentNotFoundError(reference)
      collectionOf(reference.collection.name).set(reference.id, { ...stored, ...structuredClone(withoutUndefined(given)) })
      return { reference, data: document }
    },
    async deleteDocument (reference) {
      collectionOf(reference.collection.name).delete(reference.id)
    }
  }
}

/**
 * @param {Array<{ subject: string, email: string, password: string, disabled?: boolean }>} identities
 * @returns {import('@genoacms/contracts/authentication').Adapter}
 */
function memoryAuthentication (identities) {
  const identityOf = ({ subject, email }) => ({ subject, email })
  return {
    async authenticate (email, password) {
      const entry = identities.find(identity => identity.email === email)
      if (entry === undefined || entry.password !== password) return { rejected: 'credentials' }
      if (entry.disabled === true) return { rejected: 'disabled' }
      return identityOf(entry)
    },
    async getIdentity (subject) {
      const entry = identities.find(identity => identity.subject === subject)
      return entry === undefined || entry.disabled === true ? null : identityOf(entry)
    }
  }
}

export { memoryStorage, memoryDatabase, memoryAuthentication }
