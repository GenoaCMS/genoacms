---
title: Providers
---

A **provider** is one configured instance of an adapter: which adapter, and its options. Every
service except authorization is served by providers, and a service may have several: two GCP
projects, a MinIO server beside S3, a Firestore database beside a Postgres one.

## Declaring a provider

Each service has a helper that builds a provider entry from an adapter's specifier and its options:

| Helper | Stanza |
| :--- | :--- |
| `storageProvider(adapter, options)` | `storage.providers` |
| `databaseProvider(adapter, options)` | `database.providers` |
| `authenticationProvider(adapter, options)` | `authentication.providers` |
| `secretsProvider(adapter, options)` | `secrets.providers` |
| `languageProvider(adapter, options)` | `languages.providers` |
| `deploymentTarget(adapter, options)` | `deployment.targets` |

```ts
import { storageProvider } from '@genoacms/config'
import type {} from '@genoacms/adapter-gcp/storage'

storageProvider('@genoacms/adapter-gcp/storage', { projectId: 'my-project' })
```

The specifier is a string: GenoaCMS loads the adapter, the config never imports it. The
`import type {}` line registers that adapter's options with TypeScript, so `options` is checked
against what the adapter accepts. Without it the options are accepted unchecked, and the loader still
validates them through the adapter when the config loads.

## Names are keys

Providers are records, keyed by a name you choose. A record cannot hold one key twice, so provider
names are unique by construction:

```ts
storage: {
  providers: {
    gcs: storageProvider('@genoacms/adapter-gcp/storage', { projectId: 'my-project' }),
    archive: storageProvider('@genoacms/adapter-gcp/storage', { projectId: 'my-archive-project' })
  },
  buckets: {
    'my-project-cms': { provider: 'gcs' },
    'my-archive': { provider: 'archive' }
  },
  defaultBucket: 'my-project-cms'
}
```

Two providers of one adapter are two independent clients, each with its own options and credentials.
The name appears in log lines and error messages; nothing looks a provider up by it at runtime except
the resources bound to it.

## Binding resources to a provider

Buckets and databases name the provider that serves them, by key:

```ts
database: {
  providers: {
    firestore: databaseProvider('@genoacms/adapter-gcp/database', { projectId: 'my-project' })
  },
  databases: {
    content: { provider: 'firestore', collections }
  }
}
```

Inside `defineConfig`, a `provider` that names no key of the stanza's `providers` is a **type
error**. A config that skips the types fails to load instead, with `config/unknown-provider`. The same
holds for `deployment.default`, which must name a key of `deployment.targets`.

Authentication providers bind no resources: they are tried in key order at sign-in, as
[services](/guide/config/services) describes.

:::note[Check the adapter's options]
Each adapter documents its options in its package. The [example configs](/guide/config/examples)
show complete, checked options for the GCP, AWS, MinIO and Postgres adapters.
:::
