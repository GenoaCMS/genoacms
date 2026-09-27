import { PutObjectCommand } from '@aws-sdk/client-s3'
import { createReadStream } from 'fs'

const ARCHIVE_KEY = '.genoacms/deployment/build.zip'

/**
 * @param {import('@aws-sdk/client-s3').S3Client} s3client
 * @param {string} artifactBucket
 * @param {string} sourcePath
 * @returns {Promise<string>} the key the archive was stored under
 */
async function uploadArchive (s3client, artifactBucket, sourcePath) {
  const command = new PutObjectCommand({
    Bucket: artifactBucket,
    Key: ARCHIVE_KEY,
    Body: createReadStream(sourcePath)
  })

  try {
    await s3client.send(command)
  } catch (err) {
    throw new Error('upload-failed')
  }
  return ARCHIVE_KEY
}

export { uploadArchive, ARCHIVE_KEY }
