/**
 * @typedef {import('@genoacms/cloudabstraction').storage} storageT
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import {
  getSignedUrl as getSignedUrlFromS3
} from '@aws-sdk/s3-request-presigner'
import config from '../../config.js'
import 'dotenv/config'

const client = new S3Client({
  region: config.storage.region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

/**
 * @param {string} bucket
 * @returns {{Bucket: string}}
 */
const bucketToCommandInput = (bucket) => {
  if (!config.storage.buckets.includes(bucket)) throw new Error('bucket-unregistered')
  return {
    Bucket: bucket
  }
}

/**
 * @type {import('@genoacms/cloudabstraction').storage.getObject}
 */
const getObject = async ({ bucket, name }) => {
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
 * @type {import('@genoacms/cloudabstraction').storage.getPublicUrl}
 */
function getPublicUrl ({ bucket, name }) {
  return `https://${bucket}.s3.${config.storage.region}.amazonaws.com/${name}`
}

/**
 * @type {import('@genoacms/cloudabstraction').storage.getSignedUrl}
 */
function getSignedUrl ({ bucket, name }, expires) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: name
  })
  return getSignedUrlFromS3(client, command, { expiresIn: expires })
}

const isObjectExisting = async ({ bucket, name }) => {
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
 * @type {import('@genoacms/cloudabstraction').storage.uploadObject}
 */
const uploadObject = async ({ bucket, name }, content) => {
  const commandInput = bucketToCommandInput(bucket)
  const command = new PutObjectCommand({
    ...commandInput,
    Key: name,
    Body: content
  })

  try {
    await client.send(command)
  } catch (err) {
    throw new Error('upload-failed')
  }
}

/**
 * @type {import('@genoacms/cloudabstraction').storage.deleteObject}
 */
const deleteObject = async ({ bucket, name }) => {
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
 * @type {import('@genoacms/cloudabstraction').storage.listDirectory}
 */
const listDirectory = async ({ bucket, name }, listingParams) => {
  const commandInput = bucketToCommandInput(bucket)
  const command = new ListObjectsV2Command({
    ...commandInput,
    MaxKeys: listingParams?.limit,
    StartAfter: listingParams?.startAfter,
    Prefix: name
  })

  try {
    const response = await client.send(command)
    if (!response.Contents) return []
    console.log(response.Contents)
    return response.Contents.map((item) => ({
      name: item.Key,
      size: parseInt(item.Size),
      lastModified: item.LastModified
    }))
  } catch (err) {
    throw new Error('listing-failed')
  }
}

/**
 * @type {import('@genoacms/cloudabstraction').storage.createDirectory}
 */
const createDirectory = async ({ bucket, name }) => {
  if (await isObjectExisting({ bucket, name })) {
    throw new Error('Directory already exists')
  }
  const command = new PutObjectCommand({
    Bucket: config.storage.bucket,
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
  getPublicUrl,
  getSignedUrl,
  uploadObject,
  deleteObject,
  listDirectory,
  createDirectory
}
