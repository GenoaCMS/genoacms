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
      data: response.Body
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
async function uploadObject ({ bucket, name }, content) {
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
