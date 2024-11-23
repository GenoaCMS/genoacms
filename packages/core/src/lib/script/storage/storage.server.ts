import { config } from '@genoacms/cloudabstraction'
import type {
  DirectoryContents,
  ObjectReference,
  StorageObject
} from '@genoacms/cloudabstraction/storage'
import { streamToString } from '$lib/script/utils.server'
import { parse as parseFlatted } from 'flatted'
import {
  createDirectory,
  deleteObject,
  getObject,
  getPublicURL,
  getSignedURL,
  listDirectory,
  uploadObject
} from './providers.server'

const getBucketReferences = () => {
  return config.storage.buckets
}

const defaultBucketId = config.storage.defaultBucket

const fullyQualifiedNameToFilename = (name: string) => {
  if (name[name.length - 1] === '/') name = name.slice(0, -1)

  const lastIndexOfSlash = name.lastIndexOf('/')
  return lastIndexOfSlash === -1 ? name : name.slice(lastIndexOfSlash + 1)
}

const isDirectoryExisting = (directory: DirectoryContents) => {
  return directory.directories.length > 0 || directory.files.length > 0
}

const listOrCreateDirectory = async (reference: ObjectReference) => {
  const componentList = await listDirectory(reference)
  const isComponentListExisting = isDirectoryExisting(componentList)
  if (!isComponentListExisting) {
    await createDirectory(reference)
  }
  return componentList
}

const getObjectString = async (reference: ObjectReference) => {
  const file = await getObject(reference)
  return await streamToString(file.data)
}
const getObjectJSON = async (reference: ObjectReference) => {
  const text = await getObjectString(reference)

  return JSON.parse(text)
}
const getObjectFlatted = async (reference: ObjectReference) => {
  const text = await getObjectString(reference)
  return parseFlatted(text)
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
    }, new Date(Date.now() + 1000 * 60 * 60))
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
  defaultBucketId,
  createDirectory,
  deleteObject,
  getObject,
  getPublicURL,
  listDirectory,
  uploadObject,
  fullyQualifiedNameToFilename,
  isDirectoryExisting,
  listOrCreateDirectory,
  getObjectJSON,
  getObjectFlatted,
  processDirectoryContents
}
