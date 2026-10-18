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

/** @returns {import('@genoacms/contracts/database').Adapter} */
function memoryDatabase () {
  /** @type {Map<string, Map<string, object>>} */
  const collections = new Map()
  const collectionOf = (name) => {
    if (!collections.has(name)) collections.set(name, new Map())
    return collections.get(name)
  }

  return {
    async createDocument (reference, document) {
      const id = randomUUID()
      collectionOf(reference.name).set(id, document)
      return { reference: { collection: reference, id }, data: document }
    },
    async getCollection (reference) {
      return [...collectionOf(reference.name).entries()]
        .map(([id, data]) => ({ reference: { collection: reference, id }, data }))
    },
    async getDocument (reference) {
      const data = collectionOf(reference.collection.name).get(reference.id)
      return data === undefined ? undefined : { reference, data }
    },
    async updateDocument (reference, document) {
      collectionOf(reference.collection.name).set(reference.id, document)
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
