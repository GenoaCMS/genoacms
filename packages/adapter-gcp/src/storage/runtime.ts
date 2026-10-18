import type {
  Adapter,
  DirectoryListingParams,
  ObjectReference,
  StorageObject
} from '@genoacms/contracts/storage'
import { defineRuntime } from '@genoacms/contracts'
import { PreconditionFailedError, ObjectNotFoundError, NotADirectoryError, isDirectoryName } from '@genoacms/contracts/storage'
import { type Bucket, type File, type GetFilesOptions, Storage } from '@google-cloud/storage'
import type { GcpStorageOptions } from './descriptor.js'

const HTTP_PRECONDITION_FAILED = 412
const HTTP_NOT_FOUND = 404
const DELETE_CONCURRENCY = 10

const hasStatus = (error: unknown, status: number): boolean => (error as { code?: number })?.code === status

// STO-4, STO-7, STOR-16
async function rejectingMissing<T> (reference: ObjectReference, call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (hasStatus(error, HTTP_NOT_FOUND)) throw new ObjectNotFoundError(reference)
    throw error
  }
}

// STO-9
function listingQuery (name: string, { limit, startAfter, pageToken }: DirectoryListingParams): GetFilesOptions {
  return {
    prefix: name,
    delimiter: '/',
    autoPaginate: false,
    ...(limit === undefined ? {} : { maxResults: limit }),
    ...(startAfter === undefined ? {} : { startOffset: startAfter }),
    ...(pageToken === undefined ? {} : { pageToken })
  }
}

// STO-11, GF38
function everyDepthPage (prefix: string, pageToken: string | undefined): GetFilesOptions {
  return pageToken === undefined ? { prefix, autoPaginate: false } : { prefix, autoPaginate: false, pageToken }
}

// STO-11, GF29
async function deleteAtMost (concurrency: number, files: File[]): Promise<void> {
  let next = 0
  let failure: { error: unknown } | undefined
  const work = async (): Promise<void> => {
    while (failure === undefined && next < files.length) {
      const file = files[next++]
      try {
        await file.delete()
      } catch (error) {
        failure ??= { error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, work))
  if (failure !== undefined) throw failure.error
}

/**
 * One GCS provider. Each construction owns its client and its credential, so two providers on this
 * adapter — two GCP projects — never share either.
 */
export default defineRuntime<GcpStorageOptions, Adapter>({
  create ({ projectId, credentials }, ctx): Adapter {
    const storage = new Storage(credentials === undefined ? { projectId } : { projectId, credentials })
    const registered = new Set(ctx.resources)

    const getBucket = (name: string): Bucket => {
      if (!registered.has(name)) throw new Error('bucket-unregistered')
      return storage.bucket(name)
    }

    // STO-3, STOR-3
    const requireDirectoryName = (reference: ObjectReference, { allowRoot }: { allowRoot: boolean }): void => {
      if (!isDirectoryName(reference.name) || (!allowRoot && reference.name === '')) throw new NotADirectoryError(reference)
    }

    const getDirectoryBucket = (reference: ObjectReference, options: { allowRoot: boolean }): Bucket => {
      const bucketInstance = getBucket(reference.bucket)
      requireDirectoryName(reference, options)
      return bucketInstance
    }

    // STO-4
    const getObject: Adapter['getObject'] = async ({ bucket, name }) => {
      const bucketInstance = getBucket(bucket)
      const file = bucketInstance.file(name)

      let version: string | undefined
      try {
        const [metadata] = await file.getMetadata()
        version = metadata.generation === undefined ? undefined : String(metadata.generation)
      } catch (error) {
        if (hasStatus(error, HTTP_NOT_FOUND)) throw new ObjectNotFoundError({ bucket, name })
        version = undefined
      }

      return {
        data: file.createReadStream(),
        version
      }
    }

    const getPublicURL: Adapter['getPublicURL'] = async ({ bucket, name }) => {
      const bucketInstance = getBucket(bucket)
      const file = bucketInstance.file(name)
      return file.publicUrl()
    }

    const getSignedURL: Adapter['getSignedURL'] = async ({ bucket, name }, expires) => {
      const bucketInstance = getBucket(bucket)
      const file = bucketInstance.file(name)
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires
      })
      return url
    }

    const uploadObject: Adapter['uploadObject'] = async ({ bucket, name }, stream, options) => {
      const bucketInstance = getBucket(bucket)
      const file = bucketInstance.file(name)

      const { ifVersion, ifAbsent } = options ?? {}
      // STO-6
      const generation = ifAbsent === true ? 0 : ifVersion === undefined ? undefined : Number(ifVersion)

      try {
        await file.save(stream, generation === undefined
          ? {}
          : { preconditionOpts: { ifGenerationMatch: generation } })
      } catch (error) {
        if (hasStatus(error, HTTP_PRECONDITION_FAILED)) {
          throw new PreconditionFailedError({ bucket, name }, ifAbsent === true
            ? 'object already exists'
            : 'object changed since it was read')
        }
        throw error
      }
    }

    const moveObject: Adapter['moveObject'] = async ({ bucket, name }, newName) => {
      const bucketInstance = getBucket(bucket)
      const file = bucketInstance.file(name)
      await file.move(newName)
    }

    const deleteObject: Adapter['deleteObject'] = async ({ bucket, name }) => {
      const bucketInstance = getBucket(bucket)
      const file = bucketInstance.file(name)
      await rejectingMissing({ bucket, name }, async () => await file.delete())
    }

    // STO-9, GF21
    const listDirectory: Adapter['listDirectory'] = async (reference, listingParams = {}) => {
      const bucketInstance = getDirectoryBucket(reference, { allowRoot: true })
      const { bucket, name } = reference
      if (listingParams.limit === 0) return { files: [], directories: [] }
      const [listed, nextQuery, apiResponse] =
        (await bucketInstance.getFiles(listingQuery(name, listingParams))) as [File[], GetFilesOptions | null, { prefixes?: string[] } | undefined]
      const skipped = (itemName: string): boolean => itemName === name || itemName === listingParams.startAfter
      const files = listed.filter(file => !file.name.endsWith('.folderPlaceholder') && !skipped(file.name))
      const prefixes = (apiResponse?.prefixes ?? []).filter(item => !skipped(item))
      const next = nextQuery?.pageToken

      return {
        ...(next === undefined ? {} : { next }),
        files: files.map((file) => {
          return {
            name: file.name,
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            size: file.metadata.size ? parseInt(file.metadata.size as string) : 0,
            lastModified: new Date(file.metadata.updated as string)
          } satisfies StorageObject
        }),
        directories: prefixes.map(i => {
          const object: ObjectReference = {
            bucket,
            name: i
          }
          return object
        })
      }
    }

    // STO-10, CD10
    const createDirectory: Adapter['createDirectory'] = async (reference) => {
      const bucketInstance = getDirectoryBucket(reference, { allowRoot: false })
      const file = bucketInstance.file(`${reference.name}.folderPlaceholder`)
      await file.save('')
    }

    // STO-11, GD7, GF29
    const deleteDirectory: Adapter['deleteDirectory'] = async (reference) => {
      const bucketInstance = getDirectoryBucket(reference, { allowRoot: false })
      let pageToken: string | undefined
      do {
        const [files, nextQuery]: [File[], GetFilesOptions | null, unknown] = await bucketInstance.getFiles(everyDepthPage(reference.name, pageToken))
        await deleteAtMost(DELETE_CONCURRENCY, files)
        pageToken = nextQuery?.pageToken
      } while (pageToken !== undefined)
    }

    // STO-12, GD7, GF22
    const moveDirectory: Adapter['moveDirectory'] = async (reference, newName) => {
      const bucketInstance = getDirectoryBucket(reference, { allowRoot: false })
      requireDirectoryName({ bucket: reference.bucket, name: newName }, { allowRoot: false })
      const { name } = reference
      const [files] = await bucketInstance.getFiles({ prefix: name })
      for (const file of files) await file.move(newName + file.name.slice(name.length))
    }

    return {
      getObject,
      getPublicURL,
      getSignedURL,
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
