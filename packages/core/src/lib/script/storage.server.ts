import { config } from '@genoacms/cloudabstraction'
import type {
  Adapter,
  DirectoryContents,
  ObjectData,
  ObjectReference,
  StorageObject
} from '@genoacms/cloudabstraction/storage'
import { streamToString } from '$lib/script/utils'

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

const listOrCreateDirectory = async (reference: ObjectReference) => {
  const componentList = await listDirectory(reference)
  console.log('componentList', componentList.files)
  const isComponentListExisting = isDirectoryExisting(componentList)
  if (!isComponentListExisting) {
    await createDirectory(reference)
  }
  return componentList
}

const getObjectJSON = async (reference: ObjectReference) => {
  let file: ObjectData
  try {
    file = await getObject(reference)
  } catch (e) {
    return null
  }
  const isComponentExisting = !!file.data
  if (!isComponentExisting) {
    return null
  }
  const text = await streamToString(file.data)
  return JSON.parse(text)
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
  listOrCreateDirectory,
  getObjectJSON,
  processDirectoryContents
}
