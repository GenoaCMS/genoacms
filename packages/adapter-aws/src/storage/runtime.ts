import type { Adapter, ObjectReference } from '@genoacms/contracts/storage'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl as getSignedUrlFromS3 } from '@aws-sdk/s3-request-presigner'
import { defineRuntime } from '@genoacms/contracts'
import { PreconditionFailedError } from '@genoacms/contracts/storage'
import { join } from 'node:path'
import { clientConfig } from '../shared.js'
import type { AwsStorageOptions } from './descriptor.js'

interface Conditions { ifVersion?: string, ifAbsent?: boolean }

const isPreconditionFailure = (error: unknown): boolean => {
  const status = (error as { $metadata?: { httpStatusCode?: number } } | undefined)?.$metadata?.httpStatusCode
  return status === 412 || status === 409
}

export default defineRuntime<AwsStorageOptions, Adapter>({
  create ({ region, credentials }, ctx): Adapter {
    const client = new S3Client(clientConfig(region, credentials as never))
    const registered = new Set(ctx.resources)

    function bucketToCommandInput (bucket: string): { Bucket: string } {
      if (!registered.has(bucket)) throw new Error('bucket-unregistered')
      return { Bucket: bucket }
    }

    const getObject = async ({ bucket, name }: ObjectReference): Promise<any> => {
      const command = new GetObjectCommand({ ...bucketToCommandInput(bucket), Key: name })
      try {
        const response = await client.send(command)
        return { data: response.Body, version: response.ETag }
      } catch (err) {
        console.error(err)
      }
    }

    const getPublicURL = ({ bucket, name }: ObjectReference): any =>
      `https://${bucket}.s3.${region}.amazonaws.com/${name}`

    const getSignedURL: Adapter['getSignedURL'] = async ({ bucket, name }, expires) => {
      const command = new GetObjectCommand({ Bucket: bucket, Key: name })
      return await getSignedUrlFromS3(client, command, { expiresIn: (expires.getTime() - Date.now()) / 1_000 })
    }

    async function isObjectExisting ({ bucket, name }: ObjectReference): Promise<boolean> {
      const command = new GetObjectCommand({ ...bucketToCommandInput(bucket), Key: name })
      try {
        await client.send(command)
        return true
      } catch {
        return false
      }
    }

    async function uploadObjectConditionally ({ bucket, name }: ObjectReference, content: any, { ifVersion, ifAbsent }: Conditions): Promise<void> {
      const command = new PutObjectCommand({
        ...bucketToCommandInput(bucket),
        Key: name,
        Body: content,
        ...(ifAbsent === true ? { IfNoneMatch: '*' } : {}),
        ...(ifVersion === undefined ? {} : { IfMatch: ifVersion })
      })
      try {
        await client.send(command)
      } catch (err) {
        if (isPreconditionFailure(err)) {
          throw new PreconditionFailedError({ bucket, name }, ifAbsent === true
            ? 'object already exists'
            : 'object changed since it was read')
        }
        throw err
      }
    }

    const uploadObject: Adapter['uploadObject'] = async ({ bucket, name }, content, options) => {
      const { ifVersion, ifAbsent } = options ?? {}
      if (ifVersion !== undefined || ifAbsent === true) {
        await uploadObjectConditionally({ bucket, name }, content, { ifVersion, ifAbsent }); return
      }
      const upload = new Upload({ client, params: { Bucket: bucket, Key: name, Body: content as any } })
      try {
        await upload.done()
      } catch {
        throw new Error('upload-failed')
      }
    }

    const deleteObject: Adapter['deleteObject'] = async ({ bucket, name }) => {
      const command = new DeleteObjectCommand({ ...bucketToCommandInput(bucket), Key: name })
      try {
        await client.send(command)
      } catch {
        throw new Error('delete-failed')
      }
    }

    const listDirectory = async ({ bucket, name }: ObjectReference, listingParams?: { limit?: number, startAfter?: string }): Promise<any> => {
      if (name !== '') name = join(name, '/')
      const command = new ListObjectsV2Command({
        ...bucketToCommandInput(bucket),
        MaxKeys: listingParams?.limit,
        StartAfter: listingParams?.startAfter,
        Delimiter: '/',
        Prefix: name
      })
      try {
        const response = await client.send(command)
        if (response.Contents === undefined) return { files: [], directories: [] }
        const directories = (response.CommonPrefixes ?? []).map(item => item.Prefix)
        const files = response.Contents.filter(item => item.Key !== name).map(item => ({
          name: item.Key,
          size: parseInt(String(item.Size)),
          lastModified: item.LastModified
        }))
        return { files, directories }
      } catch (err) {
        console.error(err)
        throw new Error('listing-failed')
      }
    }

    const createDirectory: Adapter['createDirectory'] = async ({ bucket, name }) => {
      if (await isObjectExisting({ bucket, name })) throw new Error('Directory already exists')
      const command = new PutObjectCommand({ Bucket: bucket, Key: `${name}/`, Body: '' })
      try {
        await client.send(command)
      } catch {
        throw new Error('directory-creation-failed')
      }
    }

    return {
      getObject,
      getPublicURL,
      getSignedURL,
      uploadObject,
      deleteObject,
      listDirectory,
      createDirectory
    } as unknown as Adapter
  }
})
