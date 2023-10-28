import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import config from '../../config.js'
import 'dotenv/config'

const client = new S3Client({
  region: config.storage.region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

const getObject = async (name) => {
  const command = new GetObjectCommand({
    Bucket: config.storage.bucket,
    Key: name
  })

  try {
    const response = await client.send(command)
    return response.Body.transformToWebStream()
  } catch (err) {
    console.error(err)
  }
}

const isObjectExisting = async (name) => {
  const command = new GetObjectCommand({
    Bucket: config.storage.bucket,
    Key: name
  })

  try {
    await client.send(command)
    return true
  } catch (err) {
    return false
  }
}

const uploadObject = async (name, content) => {
  const command = new PutObjectCommand({
    Bucket: config.storage.bucket,
    Key: name,
    Body: content
  })

  try {
    const response = await client.send(command)
    console.log(response)
  } catch (err) {
    console.error(err)
  }
}

const deleteObject = async (name) => {
  const command = new DeleteObjectCommand({
    Bucket: config.storage.bucket,
    Key: name
  })

  try {
    const response = await client.send(command)
    console.log(response)
  } catch (err) {
    console.error(err)
  }
}

const listDirectory = async ({ limit, startOn }) => {
  const command = new ListObjectsCommand({
    Bucket: config.storage.bucket,
    MaxKeys: limit,
    prefix: startOn
  })

  try {
    const response = await client.send(command)
    console.log(response)
  } catch (err) {
    console.error(err)
  }
}

const createDirectory = async (name) => {
  if (await isObjectExisting(name)) {
    throw new Error('Directory already exists')
  }
  const command = new PutObjectCommand({
    Bucket: config.storage.bucket,
    Key: `${name}/`,
    Body: ''
  })

  try {
    const response = await client.send(command)
    console.log(response)
  } catch (err) {
    console.error(err)
  }
}

// (async () => {
//     const object = await isObjectExisting('testijoasjdiaj')
//     console.log(object)
// })()
// uploadObject('testDir/', undefined)
// listDirectory({ limit: 1})

export {
  getObject,
  uploadObject,
  deleteObject,
  listDirectory,
  createDirectory
}
