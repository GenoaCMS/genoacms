---
title: Storage types
---

## Concurrent writes

The only write an object store offers is *replace the whole object*. Two writers who both read an
object and both write it back produce a **lost update**: the second silently erases the first, and
nothing records that it happened. GenoaCMS stores mutable documents — page trees, component
definitions, its own manifests — this way, so the contract addresses it directly.

### Version tokens

`getObject` returns a `version` alongside the data, and `uploadObject` can require it:

```ts
const { data, version } = await getObject(reference)
// ...modify...
await uploadObject(reference, updated, { ifVersion: version })
```

If the object changed after it was read, the write is refused rather than applied. `ifAbsent: true`
is the other form — write only if the object does not exist, which lets any number of racing callers
create something while exactly one succeeds.

A refused write raises `PreconditionFailedError`:

```ts
import { isPreconditionFailed } from '@genoacms/cloudabstraction/storage'

try {
  await uploadObject(reference, updated, { ifVersion: version })
} catch (error) {
  if (!isPreconditionFailed(error)) throw error
  // Someone else wrote first. Re-read and decide.
}
```

:::caution[Do not retry blindly]
A rejected conditional write means someone else's change is now in the object. Replaying the write
over it reintroduces the lost update the condition existed to prevent. Re-read, and where a person
authored the change, tell them there is a conflict.
:::

:::note[The token is opaque]
`ObjectVersion` is a GCS generation on one adapter and an S3 etag on another. It is not a number, a
timestamp or an ordering — it may only be handed back to `uploadObject`. Code that compares or sorts
versions works against one provider and fails subtly against the next.

`version` may be absent when an adapter cannot supply one. That removes the ability to write
conditionally against that object; it does not make the read invalid.
:::

### There are no transactions

Object storage provides **no cross-object atomicity**. Neither S3, GCS nor MinIO exposes an API that
commits several objects together or rolls them back, and nothing above the adapter can supply the
guarantee — a sequence of writes can always be interrupted part-way.

GenoaCMS therefore does not offer a transaction API. An interface named for a guarantee it cannot
provide is worse than its absence, because callers rely on the name. Where several objects must
change together, design so that each write is independently valid, and use `ifVersion` to detect
that the world moved underneath you.

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

type ObjectVersion = string

interface UploadOptions {
  gzip?: boolean
  ifVersion?: ObjectVersion
  ifAbsent?: boolean
}

interface ObjectData {
  data: NodeJS.ReadableStream
  version?: ObjectVersion
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

/** Returns the object together with a version token for conditional writes. */
type getObject = (reference: ObjectReference) => Promise<ObjectData>
type getSignedURL = (reference: ObjectReference, expires: Date) => Promise<string>
type getPublicURL = (reference: ObjectReference) => Promise<string>
/** Rejects with PreconditionFailedError when `ifVersion` or `ifAbsent` is not satisfied. */
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
