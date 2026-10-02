import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'

/**
 * In-memory adapters. They exist to prove the suites *run* against a correct implementation; they
 * are not a reference implementation of either service.
 */

/** @returns {import('@genoacms/contracts/storage').Adapter} */
function memoryStorage () {
  /** @type {Map<string, { text: string, lastModified: Date }>} */
  const objects = new Map()
  const key = ({ bucket, name }) => `${bucket}/${name}`
  const inDirectory = (bucket, prefix) => [...objects.entries()]
    .filter(([k]) => k.startsWith(`${bucket}/${prefix}`))
    .map(([k, v]) => ({ name: k.slice(bucket.length + 1), ...v }))

  return {
    async getObject (reference) {
      const object = objects.get(key(reference))
      if (object === undefined) throw new Error(`not found: ${key(reference)}`)
      return { data: Readable.from([Buffer.from(object.text)]) }
    },
    async getSignedURL (reference) { return `memory://${key(reference)}?signed` },
    async getPublicURL (reference) { return `memory://${key(reference)}` },
    async uploadObject (reference, data) {
      objects.set(key(reference), { text: String(data), lastModified: new Date() })
    },
    async moveObject (reference, destination) {
      const object = objects.get(key(reference))
      objects.delete(key(reference))
      objects.set(key({ bucket: reference.bucket, name: destination }), object)
    },
    async deleteObject (reference) { objects.delete(key(reference)) },
    async listDirectory ({ bucket, name }) {
      const entries = inDirectory(bucket, name).filter(entry => !entry.name.slice(name.length).includes('/'))
      return {
        files: entries.map(entry => ({ name: entry.name, size: Buffer.byteLength(entry.text), lastModified: entry.lastModified })),
        directories: []
      }
    },
    async createDirectory () {},
    async deleteDirectory ({ bucket, name }) {
      for (const entry of inDirectory(bucket, name)) objects.delete(`${bucket}/${entry.name}`)
    },
    async moveDirectory ({ bucket, name }, destination) {
      for (const entry of inDirectory(bucket, name)) {
        objects.delete(`${bucket}/${entry.name}`)
        objects.set(`${bucket}/${destination}${entry.name.slice(name.length)}`, entry)
      }
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
