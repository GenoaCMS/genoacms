# `@genoacms/adapter-minio`

The GenoaCMS `storage` service for any S3-compatible server, such as MinIO or RustFS, for self-hosted instances. It keeps the name of the server it was written for.

## Configuration

```ts
// genoa.config.ts
import { defineConfig, storageProvider, databaseProvider, secretsProvider, authenticationProvider, languageProvider, deploymentTarget, secret } from '@genoacms/config'
import type {} from '@genoacms/adapter-minio'   // registers the adapter's option types; erased at runtime
import type {} from '@genoacms/adapter-postgres'
import type {} from '@genoacms/adapter-secrets-env'
import type {} from '@genoacms/adapter-node'
import type {} from '@genoacms/authentication-adapter-array'

export default defineConfig({
  authentication: { cookieName: '__session', providers: { admins: authenticationProvider('@genoacms/authentication-adapter-array', { credentials: secret('GENOACMS_ADMIN_CREDENTIALS') }) } },
  secrets: { providers: { local: secretsProvider('@genoacms/adapter-secrets-env', {}) } },
  storage: {
    providers: {
      minio: storageProvider('@genoacms/adapter-minio', {
        endPoint: 'localhost',
        port: 9000,
        useSSL: false,
        accessKey: secret('MINIO_ACCESS_KEY'),
        secretKey: secret('MINIO_SECRET_KEY')
      })
    },
    buckets: { cms: { provider: 'minio' }, public: { provider: 'minio' } },
    defaultBucket: 'cms'
  },
  database: { providers: { postgres: databaseProvider('@genoacms/adapter-postgres', { host: 'localhost', database: 'genoacms', user: 'genoacms', password: secret('POSTGRES_PASSWORD') }) }, databases: { content: { provider: 'postgres', collections: [] } } },
  languages: { providers: { typescript: languageProvider('@genoacms/language-adapter-ts', {}) } },
  deployment: { targets: { node: deploymentTarget('@genoacms/adapter-node', { outDir: 'build' }) } },
  authorization: { roles: { Administrator: [{ permission: '*', resource: '*' }] } },
  security: {}
})
```

The surrounding services here (the secrets store, the database, authentication, deployment) are examples. `@genoacms/adapter-secrets-env` is for development only, so this is a development config; a production build refuses it.

## Options

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `endPoint` | `string` | required | The server's host name. Required and non-empty. |
| `port` | integer, 1 to 65535 | the client library's default | The server's port. |
| `useSSL` | `boolean` | the client library's default, `https` | `true` for `https`, `false` for `http`. Set it: public URLs use `https` only when it is `true`. |
| `region` | `string` | the client library's default | The S3 region. |
| `accessKey` | string secret | required | The access key. `secret()`, `env()` or `inline()`, never a bare value. |
| `secretKey` | string secret | required | The secret key. `secret()`, `env()` or `inline()`, never a bare value. |

An option that is not set is not passed to the client. Any other option is refused with `unknown option '<key>'`. The descriptor reports each of these, one reason per problem:

```
endPoint is required and must be a non-empty string
port must be an integer between 1 and 65535
useSSL must be a boolean
accessKey is required
secretKey is required
```

Each provider creates its own client, so two providers can serve two servers.

## Behavior

The buckets the config assigns to the provider are the only ones it serves. A reference to any other bucket throws `bucket-unregistered` before any request, and the adapter asks the server nothing to check it. Errors from the client library propagate unchanged, except where stated below, and the adapter writes nothing to the console.

- **Server requirement.** The server must honor `If-None-Match: *` and `If-Match` on `PutObject`. A server that ignores them silently loses conditional writes, which GenoaCMS relies on for optimistic concurrency. Garage 2.1.0 ignores them and does not qualify. The adapter is tested against RustFS.
- **Reading** is two requests, `statObject` and then `getObject`. The version is the ETag from the first. If a write lands between the two, the version can belong to a newer write than the bytes read; the conditional write that follows is then refused, never lost. The S3 codes `NoSuchKey` and `NotFound` reject with `ObjectNotFoundError`.
- **Conditional writes.** `ifAbsent` sends `If-None-Match: *`, `ifVersion` sends `If-Match: <version>`. A conditional write of a stream reads it into memory first and sends one `PUT`, so a conditional write of a large stream is held in memory whole. A write refused with `PreconditionFailed`, or an `ifVersion` write answered `NoSuchKey` because the object is gone, throws `PreconditionFailedError`, with the reason `object already exists` (`ifAbsent`) or `object changed since it was read`.
- **Public URL** is `<scheme>://<endPoint>[:<port>]/<bucket>/<encodeURIComponent(name)>`, with `https` when `useSSL` is `true` and `http` otherwise, and the port only when configured. The adapter does not check that the object is public.
- **Signed URL** is the client's presigned `GET` URL, valid for `floor((expires - now) / 1000)` seconds. A lifetime the client refuses propagates its error.
- **Moving** an object is a copy and then a removal. A failed copy removes nothing; a failed removal after the copy leaves both objects. **Deleting** an object is `statObject` first, and a missing object rejects with `ObjectNotFoundError`.
- **Directories.** `createDirectory` writes the empty object `<name>`, the server's own directory object, which the server lists as a directory while nothing else lies under it. Listing returns one level (delimiter `/`), at most `limit` entries (1000 when not given), and `next` is the continuation token when the result is truncated. Objects whose name ends in `.directoryPlaceholder`, written by older versions of this adapter, are hidden from listings, so an object of yours with that ending is never listed.
- **Deleting a directory** lists every object under it, at every depth, page by page, and removes each page before listing the next. The first error stops it and rejects with that error; a key the server reports as failed rejects with `storage/delete-failed: <bucket>/<key>: <code>`. A failure part-way leaves the directory partly deleted.
- **Moving a directory** lists every object under it first, then moves them one at a time. The first failure rejects and nothing further is moved, which leaves the directory partly moved.
- **Shared buckets.** A bucket written by the GCP or AWS adapter shows their `.folderPlaceholder` objects as files when served from here, and a bucket written here loses its empty directories when they serve it.
- **Server limits on names.** RustFS 1.0.3 refuses a key with an empty level (`a//b`) or a `.` or `..` level with `InvalidArgument: Invalid object key`, so such a name cannot be written there.
