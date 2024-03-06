import config from '../../config.js'
import { getBucket } from '../storage/storage.js'
import { readdir, lstat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { CloudFunctionsServiceClient } from '@google-cloud/functions'

const functionsClient = new CloudFunctionsServiceClient({
  credentials: config.deployment.credentials
})
const projectId = config.deployment.projectId
const region = config.deployment.region

async function uploadDirectory (bucketName: string, directoryPath: string, prefix = ''): Promise<void> {
  const bucket = getBucket(bucketName)
  const files = await readdir(directoryPath)

  for (const file of files) {
    const filePath = join(directoryPath, file)
    const destination = join(prefix, file)

    const isFileDirectory = (await lstat(filePath)).isDirectory()
    if (isFileDirectory) {
      await uploadDirectory(bucketName, filePath, destination)
    } else {
      const fileStream = createReadStream(filePath)
      const gcsFile = bucket.file(destination)

      await new Promise((resolve, reject) => {
        fileStream
          .pipe(gcsFile.createWriteStream())
          .on('error', reject)
          .on('finish', resolve)
      })
    }
  }
}

async function uploadSourceCode (bucketName: string, source: string, dest: string): Promise<string> {
  const bucket = getBucket(bucketName)
  const uploadResponse = await bucket.upload(source, {
    gzip: true,
    destination: dest
  })
  const file = uploadResponse[0]
  return file.cloudStorageURI.toString()
}

async function deployFunction (name: string, source: string): Promise<void> {
  const location = functionsClient.locationPath(projectId, region)
  const [response] = await functionsClient.createFunction({
    location,
    function: {
      name,
      sourceUploadUrl: source,
      entryPoint: 'handler',
      runtime: 'nodejs20',
      httpsTrigger: {},
      environmentVariables: {
        NODE_ENV: 'production'
      }
    }
  }, {})
  console.log(response)
}

export default async function (): Promise<void> {
  const bucketName = config.storage.defaultBucket
  const assetsPath = '.genoacms/deployment/static'
  const buildArchivePath = '.genoacms/deployment/build.zip'
  await uploadDirectory(bucketName, './static', assetsPath)
  const buildArchiveURI = await uploadSourceCode(bucketName, './build', buildArchivePath)
  await deployFunction('genoacms', buildArchiveURI)
}
