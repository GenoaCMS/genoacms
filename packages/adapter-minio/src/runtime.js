import * as Minio from 'minio'
import { Readable } from 'node:stream'
import { defineRuntime } from '@genoacms/contracts'
import {
  PreconditionFailedError,
  ObjectNotFoundError,
  NotADirectoryError,
  isDirectoryName
} from '@genoacms/contracts/storage'

/**
 * @import {Adapter, ObjectReference} from '@genoacms/contracts/storage'
 */

const LEGACY_PLACEHOLDER = '.directoryPlaceholder'
const PAGE_SIZE = 1000
const MISSING_CODES = new Set(['NoSuchKey', 'NotFound'])

/**
 * Drops keys whose value is `undefined`, so the Minio client's own defaults apply.
 *
 * @param {Record<string, unknown>} options
 */
const withoutUndefined = (options) => Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined))

/** @param {unknown} error */
const codeOf = (error) => /** @type {{ code?: unknown } | undefined} */ (error)?.code

/** @param {unknown} error */
const isMissing = (error) => MISSING_CODES.has(/** @type {string} */ (codeOf(error)))

/**
 * @param {string | Buffer | NodeJS.ReadableStream} data
 * @returns {Promise<Buffer>}
 */
async function toBuffer (data) {
  if (typeof data === 'string') return Buffer.from(data)
  if (Buffer.isBuffer(data)) return data
  const chunks = []
  for await (const chunk of Readable.from(/** @type {AsyncIterable<Buffer>} */ (data))) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

/**
 * @param {{ ifAbsent?: boolean, ifVersion?: string }} options
 * @returns {Record<string, string> | undefined}
 */
function conditionHeaders ({ ifAbsent, ifVersion }) {
  if (ifAbsent === true) return { 'If-None-Match': '*' }
  if (ifVersion !== undefined) return { 'If-Match': ifVersion }
  return undefined
}

/**
 * @param {ObjectReference} reference
 * @param {{ ifAbsent?: boolean }} options
 * @param {unknown} error
 */
function refusal (reference, { ifAbsent }, error) {
  const code = codeOf(error)
  if (code === 'PreconditionFailed') {
    return new PreconditionFailedError(reference, ifAbsent === true ? 'object already exists' : 'object changed since it was read')
  }
  if (code === 'NoSuchKey' && ifAbsent !== true) return new PreconditionFailedError(reference, 'object changed since it was read')
  return error
}

/**
 * One provider on any S3-compatible server, with its own client (MU2). The bucket check reads the
 * buckets bound to this provider rather than the whole configuration.
 */
export default defineRuntime({
  create ({ endPoint, port, useSSL, region, accessKey, secretKey }, ctx) {
    const client = new Minio.Client(withoutUndefined({ endPoint, port, useSSL, region, accessKey, secretKey }))
    const registered = new Set(ctx.resources)

    // MIO-3
    /** @param {string} bucket */
    const requireRegistered = (bucket) => {
      if (!registered.has(bucket)) throw new Error('bucket-unregistered')
    }

    // MIO-3, STOR-3
    /**
     * @param {ObjectReference} reference
     * @param {{ allowRoot: boolean }} options
     */
    const requireDirectory = (reference, { allowRoot }) => {
      requireRegistered(reference.bucket)
      if (!isDirectoryName(reference.name) || (!allowRoot && reference.name === '')) throw new NotADirectoryError(reference)
    }

    /**
     * @template T
     * @param {ObjectReference} reference
     * @param {() => Promise<T>} call
     * @returns {Promise<T>}
     */
    const rejectingMissing = async (reference, call) => {
      try {
        return await call()
      } catch (error) {
        if (isMissing(error)) throw new ObjectNotFoundError(reference)
        throw error
      }
    }

    // MIO-11, MIO-12
    /**
     * @param {string} bucket
     * @param {string} prefix
     * @param {string} pageToken
     */
    const listEveryDepth = async (bucket, prefix, pageToken) =>
      await client.listObjectsV2Query(bucket, prefix, pageToken, '', PAGE_SIZE, '')

    /**
     * @param {string} bucket
     * @param {string} prefix
     * @returns {Promise<string[]>}
     */
    const namesUnder = async (bucket, prefix) => {
      const names = []
      let pageToken = ''
      do {
        const page = await listEveryDepth(bucket, prefix, pageToken)
        for (const entry of page.objects) if (entry.name !== undefined) names.push(entry.name)
        pageToken = page.isTruncated ? page.nextContinuationToken : ''
      } while (pageToken !== '')
      return names
    }

    // MIO-11
    /**
     * @param {string} bucket
     * @param {string[]} names
     */
    const removeAll = async (bucket, names) => {
      const [failure] = await client.removeObjects(bucket, names)
      if (failure !== undefined) throw new Error(`storage/delete-failed: ${bucket}/${failure.Key}: ${failure.Code}`)
    }

    // MIO-8
    /**
     * @param {string} bucket
     * @param {string} name
     * @param {string} destination
     */
    const copyThenRemove = async (bucket, name, destination) => {
      await client.copyObject(bucket, destination, `/${bucket}/${name}`)
      await client.removeObject(bucket, name)
    }

    // MIO-4
    /** @type {Adapter['getObject']} */
    const getObject = async (reference) => {
      requireRegistered(reference.bucket)
      const { bucket, name } = reference
      return await rejectingMissing(reference, async () => {
        const { etag } = await client.statObject(bucket, name)
        const data = await client.getObject(bucket, name)
        return { data, version: etag }
      })
    }

    // MIO-5
    /** @type {Adapter['getPublicURL']} */
    const getPublicURL = async ({ bucket, name }) => {
      requireRegistered(bucket)
      const scheme = useSSL === true ? 'https' : 'http'
      const authority = port === undefined ? endPoint : `${endPoint}:${port}`
      return `${scheme}://${authority}/${bucket}/${encodeURIComponent(name)}`
    }

    // MIO-6
    /** @type {Adapter['getSignedURL']} */
    const getSignedURL = async ({ bucket, name }, expires) => {
      requireRegistered(bucket)
      const seconds = Math.floor((expires.getTime() - Date.now()) / 1000)
      return await client.presignedGetObject(bucket, name, seconds)
    }

    // MIO-7, MD1
    /** @type {Adapter['uploadObject']} */
    const uploadObject = async (reference, data, options = {}) => {
      requireRegistered(reference.bucket)
      const { bucket, name } = reference
      const headers = conditionHeaders(options)
      if (headers === undefined) {
        await client.putObject(bucket, name, /** @type {never} */ (data))
        return
      }
      const body = await toBuffer(data)
      try {
        await client.putObject(bucket, name, body, body.length, headers)
      } catch (error) {
        throw refusal(reference, options, error)
      }
    }

    // MIO-8
    /** @type {Adapter['moveObject']} */
    const moveObject = async ({ bucket, name }, destination) => {
      requireRegistered(bucket)
      await copyThenRemove(bucket, name, destination)
    }

    // MIO-8
    /** @type {Adapter['deleteObject']} */
    const deleteObject = async (reference) => {
      requireRegistered(reference.bucket)
      const { bucket, name } = reference
      await rejectingMissing(reference, async () => await client.statObject(bucket, name))
      await client.removeObject(bucket, name)
    }

    // MIO-9, MD4
    /** @type {Adapter['listDirectory']} */
    const listDirectory = async (reference, { limit, startAfter, pageToken } = {}) => {
      requireDirectory(reference, { allowRoot: true })
      const { bucket, name } = reference
      const page = await client.listObjectsV2Query(bucket, name, pageToken ?? '', '/', limit ?? PAGE_SIZE, startAfter ?? '')
      const files = []
      const directories = []
      for (const entry of page.objects) {
        if (entry.prefix !== undefined) {
          if (entry.prefix !== name) directories.push({ bucket, name: entry.prefix })
        } else if (entry.name !== name && !entry.name.endsWith(LEGACY_PLACEHOLDER)) {
          files.push({ name: entry.name, size: entry.size, lastModified: entry.lastModified })
        }
      }
      return page.isTruncated
        ? { files, directories, next: page.nextContinuationToken }
        : { files, directories }
    }

    // MIO-10, MD3
    /** @type {Adapter['createDirectory']} */
    const createDirectory = async (reference) => {
      requireDirectory(reference, { allowRoot: false })
      await client.putObject(reference.bucket, reference.name, Buffer.alloc(0), 0)
    }

    // MIO-11
    /** @type {Adapter['deleteDirectory']} */
    const deleteDirectory = async (reference) => {
      requireDirectory(reference, { allowRoot: false })
      const { bucket, name } = reference
      let pageToken = ''
      do {
        const page = await listEveryDepth(bucket, name, pageToken)
        const names = page.objects.flatMap(entry => entry.name === undefined ? [] : [entry.name])
        if (names.length > 0) await removeAll(bucket, names)
        pageToken = page.isTruncated ? page.nextContinuationToken : ''
      } while (pageToken !== '')
    }

    // MIO-12
    /** @type {Adapter['moveDirectory']} */
    const moveDirectory = async (reference, destination) => {
      requireDirectory(reference, { allowRoot: false })
      requireDirectory({ bucket: reference.bucket, name: destination }, { allowRoot: false })
      const { bucket, name } = reference
      const names = await namesUnder(bucket, name)
      for (const source of names) await copyThenRemove(bucket, source, destination + source.slice(name.length))
    }

    return {
      getObject,
      getSignedURL,
      getPublicURL,
      uploadObject,
      moveObject,
      deleteObject,
      listDirectory,
      createDirectory,
      deleteDirectory,
      moveDirectory
    }
  }
})
