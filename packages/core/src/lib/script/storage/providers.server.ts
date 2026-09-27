import { host } from '$lib/script/host.server'
import type { ObjectReference, ObjectPayload, UploadOptions } from '@genoacms/contracts/storage'

async function getObject (reference: ObjectReference) {
  const provider = await host.storageForBucket(reference.bucket)
  return await provider.getObject(reference)
}

async function uploadObject (reference: ObjectReference, data: ObjectPayload, options?: UploadOptions) {
  const provider = await host.storageForBucket(reference.bucket)
  return await provider.uploadObject(reference, data, options ?? {})
}

async function moveObject (reference: ObjectReference, newPath: string) {
  const provider = await host.storageForBucket(reference.bucket)
  return await provider.moveObject(reference, newPath)
}

async function deleteObject (reference: ObjectReference) {
  const provider = await host.storageForBucket(reference.bucket)
  return await provider.deleteObject(reference)
}

async function getSignedURL (reference: ObjectReference, expires: Date) {
  const provider = await host.storageForBucket(reference.bucket)
  return await provider.getSignedURL(reference, expires)
}

async function getPublicURL (reference: ObjectReference) {
  const provider = await host.storageForBucket(reference.bucket)
  return await provider.getPublicURL(reference)
}

async function listDirectory (reference: ObjectReference) {
  const provider = await host.storageForBucket(reference.bucket)
  return await provider.listDirectory(reference)
}

async function createDirectory (reference: ObjectReference) {
  const provider = await host.storageForBucket(reference.bucket)
  return await provider.createDirectory(reference)
}

async function moveDirectory (reference: ObjectReference, newPath: string) {
  const provider = await host.storageForBucket(reference.bucket)
  return await provider.moveDirectory(reference, newPath)
}

async function deleteDirectory (reference: ObjectReference) {
  const provider = await host.storageForBucket(reference.bucket)
  return await provider.deleteDirectory(reference)
}

export {
  deleteObject,
  getObject,
  moveObject,
  uploadObject,
  getPublicURL,
  getSignedURL,
  listDirectory,
  createDirectory,
  moveDirectory,
  deleteDirectory
}
