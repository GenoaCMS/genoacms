---
title: Storage types
---

## Core

```ts
interface ObjectReference {
  bucket: string
  name: string
}

interface StorageObject {
  name: string
  size: number
  lastModified: Date
}

type ObjectPayload = string | Buffer | NodeJS.ReadableStream

interface UploadOptions {
  gzip?: boolean
}

interface ObjectData {
  data: NodeJS.ReadableStream
}

interface DirectoryListingParams {
  startAfter?: string
  limit?: number
}

interface DirectoryContents {
  files: StorageObject[]
  directories: string[]
}
```

## Adapter

```ts
import type {
  ObjectReference,
  ObjectPayload,
  ObjectData,
  DirectoryListingParams,
  DirectoryContents,
  UploadOptions
} from './types.d.ts'

type getObject = (reference: ObjectReference) => Promise<ObjectData>
type getSignedURL = (reference: ObjectReference, expires: Date) => Promise<string>
type getPublicURL = (reference: ObjectReference) => Promise<string>
type uploadObject = (reference: ObjectReference, data: ObjectPayload, options: UploadOptions) => Promise<void>
type deleteObject = (reference: ObjectReference) => Promise<void>
type listDirectory = (reference: ObjectReference, params?: DirectoryListingParams) => Promise<DirectoryContents>
type createDirectory = (reference: ObjectReference) => Promise<void>

interface Adapter {
  getObject: getObject
  getSignedURL: getSignedURL
  getPublicURL: getPublicURL
  uploadObject: uploadObject
  deleteObject: deleteObject
  listDirectory: listDirectory
  createDirectory: createDirectory
}

export default Adapter
```

## Module

```ts
import type Adapter from './adapter.d.ts'

declare module '@genoacms/adapter-*/storage' {
  import type Adapter from './adapter.d.ts'
  const getObject: Adapter.getObject
  const getSignedURL: Adapter.getSignedURL
  const getPublicURL: Adapter.getPublicURL
  const uploadObject: Adapter.uploadObject
  const deleteObject: Adapter.deleteObject
  const listDirectory: Adapter.listDirectory
  const createDirectory: Adapter.createDirectory
  export {
    getObject,
    getSignedURL,
    getPublicURL,
    uploadObject,
    deleteObject,
    listDirectory,
    createDirectory
  }
}

type StorageProvider<Extension extends object = object> = Extension & {
  name: string
  adapter: Promise<typeof Adapter>
}

interface BucketInit {
  name: string
  providerName: string
}

export type {
  Adapter,
  StorageProvider,
  BucketInit
}
```
