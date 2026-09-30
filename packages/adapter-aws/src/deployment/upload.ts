import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { createReadStream } from 'node:fs'

const ARCHIVE_KEY = '.genoacms/deployment/build.zip'

async function uploadArchive (s3client: S3Client, artifactBucket: string, sourcePath: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: artifactBucket, Key: ARCHIVE_KEY, Body: createReadStream(sourcePath) })
  try {
    await s3client.send(command)
  } catch {
    throw new Error('upload-failed')
  }
  return ARCHIVE_KEY
}

export { uploadArchive, ARCHIVE_KEY }
