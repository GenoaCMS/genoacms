import config from '../../config.js'
import { getBucket } from '../storage/storage.js'
import { readdir, lstat } from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { CloudFunctionsServiceClient } from '@google-cloud/functions'
import archiver from 'archiver'

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

async function zipDirectory (source: string, out: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(out)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      resolve()
    })

    archive.on('error', (err) => {
      reject(err)
    })

    archive.pipe(output)
    archive.directory(source, false)
    archive.finalize()
  })
}

async function deployFunction (functionName: string, source: string): Promise<void> {
  const location = functionsClient.locationPath(projectId, region)
  const name = functionsClient.cloudFunctionPath(projectId, region, functionName)
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
  const buildArchiveSrc = '.build.zip'
  const buildArchiveDest = '.genoacms/deployment/build.zip'
  const buildArchiveRef = `gs://${bucketName}/${buildArchiveDest}`
  await zipDirectory('./build', buildArchiveSrc)
  await uploadDirectory(bucketName, './static', assetsPath)
  await uploadDirectory(bucketName, buildArchiveSrc, buildArchiveDest)
  await deployFunction('genoacms', buildArchiveRef)
}
