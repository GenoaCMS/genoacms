# `@genoacms/config`

GenoaCMS configuration. Two entry points so far:

- `@genoacms/config`: what a config file imports. `defineConfig`, the per-service provider helpers, `secret()`, `env()` and `inline()`.
- `@genoacms/config/load`: `loadConfig()`. It evaluates a config file, loads each adapter's SDK-free descriptor from the project, applies the loader rules, and returns a JSON **manifest** that every later phase reads instead of the file.

## A config file

A config file is a module that must **evaluate to data**. It may import helpers, collection files and
JSON. It never imports an adapter: adapters are named by their descriptor specifier.

```ts
// genoa.config.ts
import { defineConfig, storageProvider, secretsProvider, authenticationProvider, databaseProvider, languageProvider, deploymentTarget, secret, inline } from '@genoacms/config'
import type {} from '@genoacms/adapter-gcp/storage'   // registers the adapter's option types; erased at runtime
import serviceAccount from './serviceAccount.json' with { type: 'json' }
import { collections } from './genoa/collections.js'

export default defineConfig({
  authentication: { cookieName: '__session', providers: { array: authenticationProvider('@genoacms/authentication-adapter-array', { credentials: secret('GENOACMS_ADMIN_CREDENTIALS') }) } },
  secrets: { providers: { local: secretsProvider('@genoacms/adapter-secrets-env', {}) } },
  storage: {
    providers: { gcs: storageProvider('@genoacms/adapter-gcp/storage', { projectId: 'my-project', credentials: inline(serviceAccount) }) },
    buckets: { content: { provider: 'gcs' } },
    defaultBucket: 'content'
  },
  database: { providers: { firestore: databaseProvider('@genoacms/adapter-gcp/database', { projectId: 'my-project' }) }, databases: { main: { provider: 'firestore', collections } } },
  languages: { providers: { typescript: languageProvider('@genoacms/language-adapter-ts', {}) } },
  deployment: { targets: { local: deploymentTarget('@genoacms/adapter-node', {}) } },
  authorization: { roles: { Administrator: [{ permission: '*', resource: '*' }] } },
  security: {}
})
```

## Credentials

| Where | `secret()` | `env()` | `inline()` | bare value |
| :-- | :-- | :-- | :-- | :-- |
| a credential field of a storage, database, authentication or language provider | yes | yes | yes; a production build warns | refused |
| a credential field of a deployment target | yes, resolved on the operator's machine | yes | yes; never enters the build | refused |
| a credential field of the secrets provider | **refused**: nothing exists yet to resolve it | yes | yes; a production build warns | refused |
| any other field | refused | refused | refused | yes |

## Loading

```ts
import { loadConfig } from '@genoacms/config/load'

const manifest = await loadConfig({ root: process.cwd(), mode: 'production' })
```

`loadConfig` rejects with a `ConfigError` listing every problem at once. Each issue has a stable `code`
and a config `path`, and never includes an option's value.

See [`docs/architecture/configuration.md`](../../docs/architecture/configuration.md).
