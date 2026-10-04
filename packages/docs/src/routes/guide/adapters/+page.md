---
title: Adapters
---

An adapter is the piece that lets GenoaCMS talk to one provider's implementation of a service —
Google Cloud Storage rather than S3, Firestore rather than Postgres. The CMS depends on the service
contract in `@genoacms/contracts`; the adapter satisfies it.

The point is that the CMS adapts, not your infrastructure. A config names adapters per service, and
several providers of one service can be configured at once: a bucket names the storage provider it
belongs to, a database names its own. See [providers](/guide/config/providers).

## Which services have adapters

| Service | What the adapter provides | Contract |
| :--- | :--- | :--- |
| Authentication | Verifying a credential, and looking an identity up again | [Authentication](/reference/contracts/authentication/) |
| Database | Documents and collections | [Database](/reference/contracts/database/) |
| Storage | Objects, directories and signed URLs | [Storage](/reference/contracts/storage/) |
| Secrets | Reading and writing secret material | [Secrets](/reference/contracts/secrets/) |
| Deployment | Building for a platform and publishing to it | [Deployment](/reference/contracts/deployment/) |
| Languages | Analyzing and compiling components | [Adding a language](/guide/language-adapters) |

The packages GenoaCMS ships:

| Package | Specifiers |
| :--- | :--- |
| `@genoacms/adapter-gcp` | `/storage`, `/database`, `/secrets`, `/authentication/identity-platform`, `/deployment` (Cloud Run functions) |
| `@genoacms/adapter-aws` | `/storage` (S3), `/database` (DynamoDB), `/secrets` (Secrets Manager), `/deployment` (Lambda) |
| `@genoacms/adapter-minio` | storage on MinIO or any S3-compatible server |
| `@genoacms/adapter-postgres` | database on PostgreSQL |
| `@genoacms/adapter-node` | deployment as a plain Node server |
| `@genoacms/adapter-secrets-env` | secrets in `.genoacms/secrets.env`, for development |
| `@genoacms/authentication-adapter-array` | sign-in from a fixed list of users held as a secret |
| `@genoacms/language-adapter-ts` | components in TypeScript |

The [example configs](/guide/config/examples) use each of them.

## What has no adapter, and why

**Authorization has none.** There is no provider to register and no adapter to write: roles,
permissions and assignments are a core module of GenoaCMS, and their data lives in your own bucket
as signed documents.

This is a deliberate boundary rather than an omission. Authentication is delegable because *"who are
you?"* has interchangeable answers — one identity provider can stand in for another. *"What may you
do here?"* does not: permissions are defined over GenoaCMS's own resources, and no external system
can enumerate a bucket the CMS knows about or decide what `pages:publish` means. An adapter for it
would be an interface with exactly one possible implementation.

The **secrets** service exists for the opposite reason: secret storage genuinely is interchangeable,
and the key material must not sit in the primary bucket beside the content it protects.

## How an adapter is built

Every adapter is two modules.

- The **descriptor** is the module at the specifier a config names. It imports nothing but `@genoacms/contracts`: no SDK, no network. GenoaCMS loads descriptors while it loads the config and while it builds, to validate options and to know how to decode credentials, so a descriptor that pulled in a cloud SDK would make every build pay for it.
- The **runtime** is the module the descriptor points to. It imports the SDK and constructs the service instance, and GenoaCMS loads it only where it runs: on the server, the first time something uses the provider.

A descriptor is made with the helper for its service — `defineStorageAdapter`, `defineDatabaseAdapter`,
`defineAuthenticationAdapter`, `defineSecretsAdapter`, `defineLanguageAdapter` or
`defineDeploymentTarget` — and declares:

| Field | Meaning |
| :--- | :--- |
| `runtime` | the bare specifier of the runtime module, never a relative path |
| `secretOptions` | which top-level options hold credentials, and whether each decodes as `'string'` or `'json'`; a reference in any other option is refused |
| `developmentOnly` | `true` makes a production build refuse the adapter |
| `validate` | checks the options before anything is resolved, and returns the reasons they are invalid; an empty array means valid |

`defineSecretsAdapter` also refuses, at compile time, options that would accept `secret()`: the
[bootstrap rule](/guide/config/secrets).

The runtime's default export has one method, `create(options, ctx)`. It receives the options with
every reference already resolved, and a context: `ctx.name`, the provider's key, for messages;
`ctx.resources`, the buckets or databases bound to this provider; and `ctx.projectRoot`, present only
in the dev server, the CLI and development builds.

### Registering the options

A descriptor module also extends the registry in `@genoacms/contracts`, so a config naming its
specifier gets its options checked:

```ts
declare module '@genoacms/contracts' {
  interface StorageAdapters { '@acme/genoacms-storage': AcmeStorageOptions }
}
```

The registries are `StorageAdapters`, `DatabaseAdapters`, `AuthenticationAdapters`, `SecretsAdapters`,
`LanguageAdapters` and `DeploymentTargets`. A config activates the registration with
`import type {} from '@acme/genoacms-storage'`.

## Writing one

A complete storage adapter for a hypothetical service, `@acme/genoacms-storage`.

The descriptor, `src/descriptor.ts`:

```ts
import { defineStorageAdapter, type Secret } from '@genoacms/contracts'

export interface AcmeStorageOptions {
  endpoint: string
  token: Secret
}

declare module '@genoacms/contracts' {
  interface StorageAdapters { '@acme/genoacms-storage': AcmeStorageOptions }
}

export default defineStorageAdapter<AcmeStorageOptions>({
  runtime: '@acme/genoacms-storage/runtime',
  secretOptions: { token: 'string' },
  validate: options => {
    const { endpoint } = (options ?? {}) as Partial<AcmeStorageOptions>
    return typeof endpoint === 'string' && endpoint !== '' ? [] : ['endpoint is required']
  }
})
```

The runtime, `src/runtime.ts`, implementing the [storage contract](/reference/contracts/storage/):

```ts
import { defineRuntime, type StorageAdapter } from '@genoacms/contracts'
import { AcmeClient } from '@acme/sdk'
import type { AcmeStorageOptions } from './descriptor.js'

export default defineRuntime<AcmeStorageOptions, StorageAdapter>({
  create ({ endpoint, token }, ctx) {
    const client = new AcmeClient({ endpoint, token })
    const bound = new Set(ctx.resources)
    const bucket = (name: string) => {
      if (!bound.has(name)) throw new Error(`bucket-unregistered: ${name} is not bound to ${ctx.name}`)
      return client.bucket(name)
    }
    return {
      getObject: async ({ bucket: name, name: object }) => await bucket(name).read(object),
      // … the other nine methods of the storage contract
    }
  }
})
```

The `exports` map of its `package.json` publishes both modules:

```json
{
  "name": "@acme/genoacms-storage",
  "type": "module",
  "exports": {
    ".": { "types": "./dist/descriptor.d.ts", "import": "./dist/descriptor.js" },
    "./runtime": { "types": "./dist/runtime.d.ts", "import": "./dist/runtime.js" }
  },
  "dependencies": {
    "@genoacms/contracts": "^0.0.1",
    "@acme/sdk": "^1.0.0"
  }
}
```

A config then names it like any shipped adapter:

```ts
import type {} from '@acme/genoacms-storage'

storageProvider('@acme/genoacms-storage', { endpoint: 'https://storage.acme.example', token: secret('ACME_TOKEN') })
```

### A deployment target

A deployment descriptor carries build-time behavior instead of a runtime:

```ts
import { defineDeploymentTarget } from '@genoacms/contracts'

export default defineDeploymentTarget<AcmeDeployOptions>({
  svelteKitAdapter: async () => await import('@sveltejs/adapter-node'),
  svelteKitOptions: (options, { outDir }) => ({ out: outDir }),
  procedure: async () => await import('./procedure.js'),
  secretOptions: { token: 'string' },
  validate: options => []
})
```

- `svelteKitAdapter` loads the SvelteKit adapter that shapes the build for the platform. It is a function inside the descriptor, so the import resolves from the adapter's package, which declares the dependency.
- `svelteKitOptions` turns the target's options into that adapter's options. It receives them **unresolved**: credentials never influence a build.
- `procedure` loads the module whose default export publishes the build: `(options, ctx) => Promise<void>`, where options are resolved and `ctx` is a `DeployContext` — `projectRoot`, `buildDir` (the artifact), `workDir` (an empty scratch directory this deploy owns) and `target` (the target's key).

## Proving it conforms

`@genoacms/conformance` holds the suites every adapter of a contract must pass. Each takes a
constructed instance, so an adapter tests exactly what its `create` returns:

```ts
import { runStorageConformance } from '@genoacms/conformance'
import runtime from '../src/runtime.js'

const bucket = process.env.ACME_TEST_BUCKET
const adapter = await runtime.create({ endpoint: process.env.ACME_TEST_ENDPOINT, token: process.env.ACME_TEST_TOKEN }, { name: 'conformance', resources: [bucket] })
runStorageConformance(adapter, { bucket })
```

`runDatabaseConformance(adapter, { collection, testDocuments })` and
`runAuthenticationConformance(adapter, { identity, disabled })` do the same for databases and
authentication. Each registers a vitest suite, so call it at the top level of a test file.

:::note[Adapters are Tier-1 configuration]
Nothing at runtime can change which adapter a service uses. Adapter declarations are immutable once
deployed, so an administrator cannot repoint storage at another bucket from inside the CMS — see
[configuration tiers](/guide/config/structure).
:::
