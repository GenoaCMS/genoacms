/**
 * @typedef {import('@genoacms/cloudabstraction/storage').Adapter} Adapter
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import {
  getSignedUrl as getSignedUrlFromS3
} from '@aws-sdk/s3-request-presigner'
import { config } from '@genoacms/cloudabstraction'
import { PreconditionFailedError } from '@genoacms/cloudabstraction/storage'
import { join } from 'path'

const client = new S3Client({
  region: config.storage.region,
  credentials: config.storage.credentials
})

/**
 * @param {string} bucket
 * @returns {{Bucket: string}}
 */
function bucketToCommandInput (bucket) {
  if (!config.storage.buckets.includes(bucket)) throw new Error('bucket-unregistered')
  return {
    Bucket: bucket
  }
}

/**
 * @type {Adapter.getObject}
 */
async function getObject ({ bucket, name }) {
  const commandInput = bucketToCommandInput(bucket)
  const command = new GetObjectCommand({
    ...commandInput,
    Key: name
  })

  try {
    const response = await client.send(command)
    return {
      data: response.Body,
      // The etag comes back with the read, so a version costs nothing here.
      version: response.ETag
    }
  } catch (err) {
    console.error(err)
  }
}

/**
 * @type {Adapter.getPublicUrl}
 */
function getPublicURL ({ bucket, name }) {
  return `https://${bucket}.s3.${config.storage.region}.amazonaws.com/${name}`
}

/**
 * @type {Adapter.getSignedUrl}
 */
function getSignedURL ({ bucket, name }, expires) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: name
  })
  return getSignedUrlFromS3(client, command, { expiresIn: (expires.getTime() - Date.now()) / 1_000 })
}

async function isObjectExisting ({ bucket, name }) {
  const commandInput = bucketToCommandInput(bucket)
  const command = new GetObjectCommand({
    ...commandInput,
    Key: name
  })

  try {
    await client.send(command)
    return true
  } catch (err) {
    return false
  }
}

/**
 * @type {Adapter.uploadObject}
 */
async function uploadObject ({ bucket, name }, content, options) {
  const { ifVersion, ifAbsent } = options ?? {}
  if (ifVersion !== undefined || ifAbsent === true) {
    return await uploadObjectConditionally({ bucket, name }, content, { ifVersion, ifAbsent })
  }

  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: name,
      Body: content
    }
  })

  try {
    await upload.done()
  } catch (err) {
    throw new Error('upload-failed')
  }
}

/**
 * A conditional write goes through `PutObject` rather than the multipart uploader.
 *
 * The condition has to be evaluated against the object as a whole, and multipart evaluates it only
 * at completion — after the parts have been uploaded. Every document written conditionally here is
 * a small JSON manifest, so the single-request path costs nothing and keeps the semantics exact.
 *
 * @param {import('@genoacms/cloudabstraction/storage').ObjectReference} reference
 * @param {any} content
 * @param {{ ifVersion?: string, ifAbsent?: boolean }} conditions
 */
async function uploadObjectConditionally ({ bucket, name }, content, { ifVersion, ifAbsent }) {
  const command = new PutObjectCommand({
    ...bucketToCommandInput(bucket),
    Key: name,
    Body: content,
    // '*' matches any existing object, so requiring it to be absent is `IfNoneMatch: '*'`.
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

/**
 * S3 answers a failed `IfMatch` with 412, and a failed `IfNoneMatch` with 412 or 409 depending on
 * whether the conflict was detected before or during the write.
 *
 * @param {unknown} error
 */
function isPreconditionFailure (error) {
  const status = /** @type {{ $metadata?: { httpStatusCode?: number } }} */ (error)?.$metadata?.httpStatusCode
  return status === 412 || status === 409
}

/**
 * @type {Adapter.deleteObject}
 */
async function deleteObject ({ bucket, name }) {
  const commandInput = bucketToCommandInput(bucket)
  const command = new DeleteObjectCommand({
    ...commandInput,
    Key: name
  })

  try {
    await client.send(command)
  } catch (err) {
    throw new Error('delete-failed')
  }
}

/**
 * @type {Adapter.listDirectory}
 */
async function listDirectory ({ bucket, name }, listingParams) {
  if (name) name = join(name, '/') // Ensure listing directory
  const commandInput = bucketToCommandInput(bucket)
  const command = new ListObjectsV2Command({
    ...commandInput,
    MaxKeys: listingParams?.limit,
    StartAfter: listingParams?.startAfter,
    Delimiter: '/',
    Prefix: name
  })

  try {
    const response = await client.send(command)
    if (!response.Contents) return { files: [], directories: [] }
    const rawDirectories = response.CommonPrefixes || []
    const rawFiles = response.Contents || []
    const directories = rawDirectories.map((item) => {
      return item.Prefix
    })
    const files = rawFiles.filter(item => item.Key !== name).map((item) => ({
      name: item.Key,
      size: parseInt(item.Size),
      lastModified: item.LastModified
    }))
    return {
      files,
      directories
    }
  } catch (err) {
    console.error(err)
    throw new Error('listing-failed')
  }
}

/**
 * @type {Adapter.createDirectory}
 */
async function createDirectory ({ bucket, name }) {
  if (await isObjectExisting({ bucket, name })) {
    throw new Error('Directory already exists')
  }
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: `${name}/`,
    Body: ''
  })

  try {
    await client.send(command)
  } catch (err) {
    throw new Error('directory-creation-failed')
  }
}

export {
  getObject,
  getPublicURL,
  getSignedURL,
  uploadObject,
  deleteObject,
  listDirectory,
  createDirectory
}
