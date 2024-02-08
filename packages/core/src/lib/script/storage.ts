import { config } from '@genoacms/cloudabstraction'
import type { DirectoryContents, StorageObject } from '@genoacms/cloudabstraction/storage'

const {
  createDirectory,
  deleteObject,
  getObject,
  listDirectory,
  uploadObject
} = await config.storage.adapter

const getBucketReferences = () => {
  return config.storage.buckets
}

const fullyQualifiedNameToFilename = (name: string) => {
  if (name[name.length - 1] === '/') name = name.slice(0, -1)
  const lastIndexOfSlash = name.lastIndexOf('/')
  return lastIndexOfSlash === -1 ? name : name.slice(lastIndexOfSlash + 1)
}

interface ProcessedDirectory {
  directories: Array<{
    path: string,
    name: string
  }>,
  files: StorageObject & { filename: string }
}

const processDirectoryContents = (contents: DirectoryContents) => {
  const processedContents: ProcessedDirectory = {
    directories: contents.directories.map(directory => {
      return {
        path: directory,
        name: fullyQualifiedNameToFilename(directory).replaceAll('/', '')
      }
    }),
    files: contents.files.map(file => {
      return {
        ...file,
        filename: fullyQualifiedNameToFilename(file.name)
      }
    })
  }
  return processedContents
}

export {
  getBucketReferences,
  createDirectory,
  deleteObject,
  getObject,
  listDirectory,
  uploadObject,
  processDirectoryContents
}
