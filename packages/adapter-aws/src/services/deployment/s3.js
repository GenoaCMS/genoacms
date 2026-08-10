import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createReadStream } from 'fs'
import { config } from '@genoacms/cloudabstraction'

const s3client = new S3Client({
  region: config.deployment.region,
  credentials: config.deployment.credentials
})

/**
  * @param {string} sourcePath
  * @returns {Promise<string>}
  */
async function uploadSource (sourcePath) {
  const destinationPath = '.genoacms/deployment/build.zip'
  const command = new PutObjectCommand({
    Bucket: config.storage.defaultBucket,
    Key: destinationPath,
    Body: createReadStream(sourcePath)
  })

  try {
    await s3client.send(command)
  } catch (err) {
    throw new Error('upload-failed')
  }
  return destinationPath
}

export { uploadSource }
