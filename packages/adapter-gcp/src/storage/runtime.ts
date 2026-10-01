import type {
  Adapter,
  ObjectReference,
  StorageObject
} from '@genoacms/contracts/storage'
import { defineRuntime } from '@genoacms/contracts'
import { PreconditionFailedError } from '@genoacms/contracts/storage'
import { type Bucket, type File, Storage } from '@google-cloud/storage'
import type { GcpStorageOptions } from './descriptor.js'

const HTTP_PRECONDITION_FAILED = 412

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

    // STO-4
    const getObject: Adapter['getObject'] = async ({ bucket, name }) => {
      const bucketInstance = getBucket(bucket)
      const file = bucketInstance.file(name)

      let version: string | undefined
      try {
        const [metadata] = await file.getMetadata()
        version = metadata.generation === undefined ? undefined : String(metadata.generation)
      } catch {
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

      const { ifVersion, ifAbsent, ...saveOptions } = options ?? {}
      // STO-6
      const generation = ifAbsent === true ? 0 : ifVersion === undefined ? undefined : Number(ifVersion)

      try {
        await file.save(stream, generation === undefined
          ? saveOptions
          : { ...saveOptions, preconditionOpts: { ifGenerationMatch: generation } })
      } catch (error) {
        if ((error as { code?: number }).code === HTTP_PRECONDITION_FAILED) {
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
      await file.delete()
    }

    const listDirectory: Adapter['listDirectory'] = async ({ bucket, name }, listingParams = {}) => {
      const bucketInstance = getBucket(bucket)
      const options = {
        autoPaginate: false,
        prefix: name,
        maxResults: listingParams?.limit,
        startOffset: listingParams?.startAfter,
        delimiter: '/'

      }
      let [files, , apiResponse] =
        (await bucketInstance.getFiles(options)) as [File[], object, { prefixes: string[] } | undefined]
      files = files.filter((file) => !file.name.endsWith('.folderPlaceholder'))
      // STO-9, GF21
      const skipped = (itemName: string): boolean => itemName === name || itemName === listingParams?.startAfter

      return {
        files: files.filter(f => !skipped(f.name)).map((file) => {
          return {
            name: file.name,
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            size: file.metadata.size ? parseInt(file.metadata.size as string) : 0,
            lastModified: new Date(file.metadata.updated as string)
          } satisfies StorageObject
        }),
        directories: (apiResponse?.prefixes ?? []).filter((item) => !skipped(item)).map(i => {
          const object: ObjectReference = {
            bucket,
            name: i
          }
          return object
        })
      }
    }

    const createDirectory: Adapter['createDirectory'] = async ({ bucket, name }) => {
      const bucketInstance = getBucket(bucket)
      const file = bucketInstance.file(`${name}/.folderPlaceholder`)
      await file.save('')
    }

    // STO-11, GD7
    const deleteDirectory: Adapter['deleteDirectory'] = async ({ bucket, name }) => {
      await getBucket(bucket).deleteFiles({ prefix: name })
    }

    // STO-12, GD7, GF22
    const moveDirectory: Adapter['moveDirectory'] = async ({ bucket, name }, newName) => {
      const [files] = await getBucket(bucket).getFiles({ prefix: name })
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
