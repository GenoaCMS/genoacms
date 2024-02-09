import { config } from '@genoacms/cloudabstraction'
import type { Adapter, DirectoryContents, StorageObject } from '@genoacms/cloudabstraction/storage'

const {
  createDirectory,
  deleteObject,
  getObject,
  getPublicURL,
  getSignedURL,
  listDirectory,
  uploadObject
} = (await config.storage.adapter) as Adapter

const getBucketReferences = () => {
  return config.storage.buckets
}

const fullyQualifiedNameToFilename = (name: string) => {
  if (name[name.length - 1] === '/') name = name.slice(0, -1)
  const lastIndexOfSlash = name.lastIndexOf('/')
  return lastIndexOfSlash === -1 ? name : name.slice(lastIndexOfSlash + 1)
}

const isDirectoryExisting = (directory: DirectoryContents) => { // TODO: move to cloudabstraction, with a better name
  return directory.directories.length > 0 || directory.files.length > 0
}

type ProcessedFile = StorageObject & { filename: string, signedURL: string }

interface ProcessedDirectory {
  directories: Array<{
    path: string,
    name: string
  }>,
  files: Array<ProcessedFile>
}

const processDirectoryNames = (directories: Array<string>) => directories.map(directory => {
  return {
    path: directory,
    name: fullyQualifiedNameToFilename(directory).replaceAll('/', '')
  }
})

const processFile = async (bucketId: string, file: StorageObject): Promise<ProcessedFile> => {
  return {
    ...file,
    filename: fullyQualifiedNameToFilename(file.name),
    signedURL: await getSignedURL({
      bucket: bucketId,
      name: file.name
    })
  }
}

const processFiles = async (bucketId: string, files: Array<StorageObject>) => {
  const filePromises = files.map(file => processFile(bucketId, file))
  return await Promise.all(filePromises)
}

const processDirectoryContents = async (bucketId: string, contents: DirectoryContents): Promise<ProcessedDirectory> => {
  const directories = processDirectoryNames(contents.directories)
  const files = await processFiles(bucketId, contents.files)
  return {
    directories,
    files
  }
}

export {
  getBucketReferences,
  createDirectory,
  deleteObject,
  getObject,
  listDirectory,
  uploadObject,
  fullyQualifiedNameToFilename,
  isDirectoryExisting,
  processDirectoryContents
}
