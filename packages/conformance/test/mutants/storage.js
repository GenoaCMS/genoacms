import { Readable } from 'node:stream'
import { posix } from 'node:path'
import * as contracts from '@genoacms/contracts/storage'
import { memoryStorage } from '../memory.js'

const fixture = { bucket: 'b' }
const correct = () => memoryStorage(['b'])

const TOKEN_FOR = (name) => Buffer.from(name, 'utf8').toString('base64url')
const NAME_OF = (token) => Buffer.from(token, 'base64url').toString('utf8')
const isDirectoryName = (name) => name === '' || name.endsWith('/')

async function bytesOf (data) {
  if (typeof data === 'string') return Buffer.from(data)
  if (Buffer.isBuffer(data)) return data
  const chunks = []
  for await (const chunk of data) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function contentOf (base, reference) {
  const { data } = await base.getObject(reference)
  return await bytesOf(data)
}

async function filesUnder (base, reference) {
  const { files, directories } = await base.listDirectory(reference)
  const nested = await Promise.all(directories.map(async directory => await filesUnder(base, directory)))
  return [...files.map(file => file.name), ...nested.flat()]
}

/** One adapter per suite test, each violating exactly the assertions of the tests it names (CONF-2). */
const MUTANTS = {
  'a method is missing': {
    tests: ['STOR-2: the adapter has the ten methods'],
    adapter: () => {
      const { getPublicURL, ...rest } = correct()
      return rest
    }
  },
  'the bucket check is skipped': {
    tests: ['STOR-4: a bucket the provider was not given is refused'],
    adapter: () => {
      const base = correct()
      const registered = (reference) => ({ ...reference, bucket: fixture.bucket })
      return {
        ...base,
        getObject: async (reference) => await base.getObject(registered(reference)),
        uploadObject: async (reference, data, options) => await base.uploadObject(registered(reference), data, options),
        listDirectory: async (reference, params) => await base.listDirectory(registered(reference), params)
      }
    }
  },
  'a wrong body': {
    tests: [
      'STOR-5, STOR-7, STOR-11: an uploaded object is listed with its size and read back byte for byte',
      'STOR-7: a stream is written whole',
      'STOR-5, STOR-6, STOR-7: a write on the version read succeeds, and the old version is refused',
      'STOR-7, STOR-8: ifAbsent creates once, and refuses an existing object',
      'STOR-7: a write without a condition replaces the object',
      'STOR-10: a moved object is read under its new name and is gone from its old one',
      'STOR-3: names are not normalized',
      'STOR-13: deleting a directory removes every object under it, and nothing beside it',
      'STOR-14: moving a directory moves every object under it, names taken literally',
      'STOR-7: of racing ifAbsent writes exactly one succeeds'
    ],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getObject: async (reference) => {
          const { version } = await base.getObject(reference)
          return { data: Readable.from([Buffer.from('WRONG CONTENT!!')]), version }
        }
      }
    }
  },
  'a buffer is stored as text': {
    tests: ['STOR-5, STOR-7, STOR-11: an uploaded object is listed with its size and read back byte for byte'],
    adapter: () => {
      const base = correct()
      return { ...base, uploadObject: async (reference, data, options) => await base.uploadObject(reference, Buffer.isBuffer(data) ? data.toString('utf8') : data, options) }
    }
  },
  'every size is zero': {
    tests: ['STOR-5, STOR-7, STOR-11: an uploaded object is listed with its size and read back byte for byte'],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        listDirectory: async (reference, params) => {
          const listing = await base.listDirectory(reference, params)
          return { ...listing, files: listing.files.map(file => ({ ...file, size: 0 })) }
        }
      }
    }
  },
  'a stream is written by its first chunk': {
    tests: ['STOR-7: a stream is written whole'],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        uploadObject: async (reference, data, options) => {
          if (typeof data === 'string' || Buffer.isBuffer(data)) return await base.uploadObject(reference, data, options)
          for await (const chunk of data) return await base.uploadObject(reference, Buffer.from(chunk), options)
        }
      }
    }
  },
  'a version never changes': {
    tests: [
      'STOR-5, STOR-6, STOR-7: a write on the version read succeeds, and the old version is refused',
      'STOR-6: every write gives the object a new version'
    ],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getObject: async (reference) => ({ ...(await base.getObject(reference)), version: 'constant' }),
        uploadObject: async (reference, data, options) => await base.uploadObject(reference, data, { ...options, ifVersion: undefined })
      }
    }
  },
  'ifVersion is ignored': {
    tests: ['STOR-5, STOR-6, STOR-7: a write on the version read succeeds, and the old version is refused'],
    adapter: () => {
      const base = correct()
      return { ...base, uploadObject: async (reference, data, options) => await base.uploadObject(reference, data, { ...options, ifVersion: undefined }) }
    }
  },
  'ifAbsent is ignored': {
    tests: [
      'STOR-7, STOR-8: ifAbsent creates once, and refuses an existing object',
      'STOR-7: of racing ifAbsent writes exactly one succeeds'
    ],
    adapter: () => {
      const base = correct()
      return { ...base, uploadObject: async (reference, data, options) => await base.uploadObject(reference, data, { ...options, ifAbsent: undefined }) }
    }
  },
  'racing ifAbsent writes all succeed': {
    tests: ['STOR-7: of racing ifAbsent writes exactly one succeeds'],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        uploadObject: async (reference, data, options) => {
          if (options.ifAbsent !== true) return await base.uploadObject(reference, data, options)
          const exists = await base.getObject(reference).then(() => true, () => false)
          if (exists) throw new contracts.PreconditionFailedError(reference, 'object already exists')
          await base.uploadObject(reference, data, { ...options, ifAbsent: undefined, ifVersion: undefined })
        }
      }
    }
  },
  'a stale ifVersion refuses ifAbsent': {
    tests: ['STOR-7, STOR-8: ifAbsent creates once, and refuses an existing object'],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        uploadObject: async (reference, data, options) => await base.uploadObject(reference, data, options.ifVersion === undefined ? options : { ifVersion: options.ifVersion })
      }
    }
  },
  'an unconditional write keeps the old object': {
    tests: [
      'STOR-7: a write without a condition replaces the object',
      'STOR-6: every write gives the object a new version'
    ],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        uploadObject: async (reference, data, options) => {
          const exists = await base.getObject(reference).then(() => true, () => false)
          if (exists && options.ifAbsent !== true && options.ifVersion === undefined) return
          await base.uploadObject(reference, data, options)
        }
      }
    }
  },
  'a missing object is a plain Error': {
    tests: [
      'STOR-16: reading a missing object rejects with ObjectNotFoundError',
      'STOR-10: a moved object is read under its new name and is gone from its old one',
      'STOR-3: names are not normalized'
    ],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        getObject: async (reference) => {
          try {
            return await base.getObject(reference)
          } catch (error) {
            throw contracts.isNotFound(error) ? new Error(`not found: ${reference.bucket}/${reference.name}`) : error
          }
        }
      }
    }
  },
  'a delete of a missing object resolves': {
    tests: ['STOR-16: deleting a missing object rejects with ObjectNotFoundError'],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        deleteObject: async (reference) => {
          try {
            await base.deleteObject(reference)
          } catch (error) {
            if (!contracts.isNotFound(error)) throw error
          }
        }
      }
    }
  },
  'a move copies': {
    tests: ['STOR-10: a moved object is read under its new name and is gone from its old one'],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        moveObject: async (reference, destination) => await base.uploadObject({ ...reference, name: destination }, await contentOf(base, reference), {})
      }
    }
  },
  'no name is checked': {
    tests: ['STOR-3: the directory methods refuse a name that is not a directory name'],
    adapter: () => {
      const base = correct()
      const unchecked = (method, result) => async (reference, ...rest) =>
        isDirectoryName(reference.name) && !(reference.name === '' && method !== 'listDirectory') ? await base[method](reference, ...rest) : result
      return {
        ...base,
        listDirectory: unchecked('listDirectory', { files: [], directories: [] }),
        createDirectory: unchecked('createDirectory'),
        deleteDirectory: unchecked('deleteDirectory'),
        moveDirectory: async (reference, destination) => isDirectoryName(reference.name) && reference.name !== '' && isDirectoryName(destination)
          ? await base.moveDirectory(reference, destination)
          : undefined
      }
    }
  },
  'a name is normalized': {
    tests: ['STOR-3: names are not normalized'],
    adapter: () => {
      const base = correct()
      const normalized = (reference) => ({ ...reference, name: posix.normalize(reference.name) })
      return {
        ...base,
        uploadObject: async (reference, data, options) => await base.uploadObject(normalized(reference), data, options),
        getObject: async (reference) => await base.getObject(normalized(reference))
      }
    }
  },
  'a placeholder is listed': {
    tests: ['STOR-11, STOR-12: a created directory is listed in its parent while empty, and shows no file'],
    adapter: () => {
      const base = correct()
      return { ...base, createDirectory: async (reference) => isDirectoryName(reference.name) && reference.name !== '' ? await base.uploadObject({ ...reference, name: `${reference.name}.folderPlaceholder` }, '', {}) : await base.createDirectory(reference) }
    }
  },
  'a created directory is not kept': {
    tests: ['STOR-11, STOR-12: a created directory is listed in its parent while empty, and shows no file'],
    adapter: () => {
      const base = correct()
      return { ...base, createDirectory: async (reference) => isDirectoryName(reference.name) && reference.name !== '' ? undefined : await base.createDirectory(reference) }
    }
  },
  'an emptied directory disappears': {
    tests: ['STOR-11, STOR-12: a created directory is listed in its parent while empty, and shows no file'],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        deleteObject: async (reference) => {
          await base.deleteObject(reference)
          const parent = { ...reference, name: reference.name.slice(0, reference.name.lastIndexOf('/') + 1) }
          const { files, directories } = await base.listDirectory(parent)
          if (files.length + directories.length === 0) await base.deleteDirectory(parent)
        }
      }
    }
  },
  'two levels are listed': {
    tests: [
      'STOR-11: a listing is one level deep',
      'STOR-11: pages list every entry exactly once'
    ],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        listDirectory: async (reference, params) => {
          const listing = await base.listDirectory(reference, params)
          const nested = await Promise.all(listing.directories.map(async directory => (await base.listDirectory(directory)).files))
          return { ...listing, files: [...listing.files, ...nested.flat()] }
        }
      }
    }
  },
  'next is on the last page': {
    tests: [
      'STOR-11: a listing is one level deep',
      'STOR-11: pages list every entry exactly once'
    ],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        listDirectory: async (reference, params) => {
          const listing = await base.listDirectory(reference, params)
          const names = [...listing.files, ...listing.directories].map(entry => entry.name).sort()
          return listing.next === undefined && names.length > 0 ? { ...listing, next: TOKEN_FOR(names.at(-1)) } : listing
        }
      }
    }
  },
  'limit is ignored': {
    tests: ['STOR-11: pages list every entry exactly once'],
    adapter: () => {
      const base = correct()
      return { ...base, listDirectory: async (reference, params) => await base.listDirectory(reference, { ...params, limit: undefined }) }
    }
  },
  'an entry is repeated across pages': {
    tests: ['STOR-11: pages list every entry exactly once'],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        listDirectory: async (reference, params) => {
          const listing = await base.listDirectory(reference, params)
          if (params?.pageToken === undefined) return listing
          const previous = NAME_OF(params.pageToken)
          return previous.endsWith('/')
            ? { ...listing, directories: [{ bucket: reference.bucket, name: previous }, ...listing.directories] }
            : { ...listing, files: [{ name: previous, size: 0, lastModified: new Date() }, ...listing.files] }
        }
      }
    }
  },
  'startAfter is inclusive': {
    tests: ['STOR-11: startAfter lists only what sorts after it'],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        listDirectory: async (reference, params) => {
          const { startAfter, ...rest } = params ?? {}
          const listing = await base.listDirectory(reference, rest)
          return startAfter === undefined
            ? listing
            : { ...listing, files: listing.files.filter(file => file.name >= startAfter), directories: listing.directories.filter(directory => directory.name >= startAfter) }
        }
      }
    }
  },
  'a directory delete leaves a subdirectory': {
    tests: ['STOR-13: deleting a directory removes every object under it, and nothing beside it'],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        deleteDirectory: async (reference) => {
          const { files } = await base.listDirectory(reference)
          for (const file of files) await base.deleteObject({ ...reference, name: file.name })
        }
      }
    }
  },
  'a directory move copies': {
    tests: ['STOR-14: moving a directory moves every object under it, names taken literally'],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        moveDirectory: async (reference, destination) => {
          if (!isDirectoryName(reference.name) || reference.name === '' || !isDirectoryName(destination)) return await base.moveDirectory(reference, destination)
          for (const name of await filesUnder(base, reference)) {
            await base.uploadObject({ ...reference, name: destination + name.slice(reference.name.length) }, await contentOf(base, { ...reference, name }), {})
          }
        }
      }
    }
  },
  'a move expands $&': {
    tests: ['STOR-14: moving a directory moves every object under it, names taken literally'],
    adapter: () => {
      const base = correct()
      return {
        ...base,
        moveDirectory: async (reference, destination) => {
          if (!isDirectoryName(reference.name) || reference.name === '' || !isDirectoryName(destination)) return await base.moveDirectory(reference, destination)
          for (const name of await filesUnder(base, reference)) {
            await base.moveObject({ ...reference, name }, name.replace(reference.name, destination))
          }
        }
      }
    }
  }
}

/** Adapters whose failure the suite must survive: it still removes what it wrote (CD6). */
const FAILING = {
  'getObject throws': {
    adapter: () => ({ ...correct(), getObject: async () => { throw new Error('getObject is broken') } })
  }
}

export { MUTANTS, FAILING, fixture, correct }
