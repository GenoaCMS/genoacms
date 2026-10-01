import type {
  Adapter,
  DirectoryContents,
  ObjectReference,
  StorageObject
} from '@genoacms/contracts/storage'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type _Object as S3Object,
  type PutObjectCommandInput
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { defineRuntime } from '@genoacms/contracts'
import { PreconditionFailedError } from '@genoacms/contracts/storage'
import { clientConfig, type AwsCredentials } from '../shared.js'
import type { AwsStorageOptions } from './descriptor.js'

const PLACEHOLDER = '.folderPlaceholder'
const DELETE_BATCH = 1000
const PRECONDITION_STATUSES = new Set([409, 412])

const httpStatus = (error: unknown): number | undefined =>
  (error as { $metadata?: { httpStatusCode?: number } } | undefined)?.$metadata?.httpStatusCode

const isFile = (name: string) => (object: S3Object): boolean =>
  object.Key !== undefined && object.Key !== name && !object.Key.endsWith(PLACEHOLDER)

const toStorageObject = (object: S3Object): StorageObject => ({
  name: object.Key as string,
  size: object.Size ?? 0,
  lastModified: object.LastModified as Date
})

function batches<T> (items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let start = 0; start < items.length; start += size) result.push(items.slice(start, start + size))
  return result
}

export default defineRuntime<AwsStorageOptions, Adapter>({
  create ({ region, credentials }, ctx): Adapter {
    const client = new S3Client(clientConfig(region, credentials as AwsCredentials | undefined))
    const registered = new Set(ctx.resources)

    // OBJ-2
    const requireRegistered = (bucket: string): void => {
      if (!registered.has(bucket)) throw new Error('bucket-unregistered')
    }

    const keysUnder = async (bucket: string, prefix: string): Promise<string[]> => {
      const keys: string[] = []
      let ContinuationToken: string | undefined
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }))
        for (const object of page.Contents ?? []) if (object.Key !== undefined) keys.push(object.Key)
        ContinuationToken = page.NextContinuationToken
      } while (ContinuationToken !== undefined)
      return keys
    }

    const copyThenDelete = async (bucket: string, name: string, destination: string): Promise<void> => {
      await client.send(new CopyObjectCommand({ Bucket: bucket, Key: destination, CopySource: `${bucket}/${encodeURIComponent(name)}` }))
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: name }))
    }

    const deleteBatch = async (bucket: string, keys: string[]): Promise<void> => {
      const response = await client.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map(Key => ({ Key })), Quiet: true }
      }))
      const [failure] = response.Errors ?? []
      if (failure !== undefined) throw new Error(`storage/delete-failed: ${bucket}/${failure.Key}: ${failure.Code}`)
    }

    const putConditionally = async ({ bucket, name }: ObjectReference, body: PutObjectCommandInput['Body'], ifAbsent: boolean, ifVersion?: string): Promise<void> => {
      const condition = ifAbsent ? { IfNoneMatch: '*' } : { IfMatch: ifVersion }
      try {
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: name, Body: body, ...condition }))
      } catch (error) {
        const status = httpStatus(error)
        if (status === undefined || !PRECONDITION_STATUSES.has(status)) throw error
        throw new PreconditionFailedError({ bucket, name }, ifAbsent ? 'object already exists' : 'object changed since it was read')
      }
    }

    // OBJ-3
    const getObject: Adapter['getObject'] = async ({ bucket, name }) => {
      requireRegistered(bucket)
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: name }))
      return { data: response.Body as never, version: response.ETag }
    }

    // OBJ-4
    const getPublicURL: Adapter['getPublicURL'] = async ({ bucket, name }) => {
      requireRegistered(bucket)
      return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(name)}`
    }

    // OBJ-5
    const getSignedURL: Adapter['getSignedURL'] = async ({ bucket, name }, expires) => {
      requireRegistered(bucket)
      const expiresIn = Math.floor((expires.getTime() - Date.now()) / 1000)
      return await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: name }), { expiresIn })
    }

    // OBJ-6
    const uploadObject: Adapter['uploadObject'] = async (reference, data, options) => {
      requireRegistered(reference.bucket)
      const { ifAbsent, ifVersion } = options ?? {}
      const body = data as PutObjectCommandInput['Body']
      if (ifAbsent === true || ifVersion !== undefined) {
        await putConditionally(reference, body, ifAbsent === true, ifVersion)
        return
      }
      await new Upload({ client, params: { Bucket: reference.bucket, Key: reference.name, Body: body } }).done()
    }

    // OBJ-7
    const moveObject: Adapter['moveObject'] = async ({ bucket, name }, destination) => {
      requireRegistered(bucket)
      await copyThenDelete(bucket, name, destination)
    }

    // OBJ-7
    const deleteObject: Adapter['deleteObject'] = async ({ bucket, name }) => {
      requireRegistered(bucket)
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: name }))
    }

    // OBJ-8
    const listDirectory: Adapter['listDirectory'] = async ({ bucket, name }, params) => {
      requireRegistered(bucket)
      const response = await client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: name,
        Delimiter: '/',
        ...(params?.limit === undefined ? {} : { MaxKeys: params.limit }),
        ...(params?.startAfter === undefined ? {} : { StartAfter: params.startAfter })
      }))
      const contents: DirectoryContents = {
        files: (response.Contents ?? []).filter(isFile(name)).map(toStorageObject),
        directories: (response.CommonPrefixes ?? [])
          .map(prefix => prefix.Prefix)
          .filter((prefix): prefix is string => prefix !== undefined && prefix !== name)
          .map(prefix => ({ bucket, name: prefix }))
      }
      return contents
    }

    // OBJ-9
    const createDirectory: Adapter['createDirectory'] = async ({ bucket, name }) => {
      requireRegistered(bucket)
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: `${name}/${PLACEHOLDER}`, Body: '' }))
    }

    // OBJ-10
    const deleteDirectory: Adapter['deleteDirectory'] = async ({ bucket, name }) => {
      requireRegistered(bucket)
      const keys = await keysUnder(bucket, name)
      for (const batch of batches(keys, DELETE_BATCH)) await deleteBatch(bucket, batch)
    }

    // OBJ-11
    const moveDirectory: Adapter['moveDirectory'] = async ({ bucket, name }, destination) => {
      requireRegistered(bucket)
      const keys = await keysUnder(bucket, name)
      for (const key of keys) await copyThenDelete(bucket, key, `${destination}${key.slice(name.length)}`)
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
