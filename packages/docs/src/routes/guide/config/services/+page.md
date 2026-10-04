---
title: Services
---

A config has one stanza per service, plus `authorization` and `security`, which configure GenoaCMS
itself. Every stanza except `deployment` is required. The [example configs](/guide/config/examples)
show each of them filled in.

## Authentication

Checks that users are who they claim to be. GenoaCMS keeps the session itself, as signed tokens in
one cookie; see [identity and sessions](/guide/sessions).

```ts
authentication: {
  providers: Record<string, AuthenticationProvider>
  cookieName: string
}
```

At sign-in the providers are tried **one at a time, in key order**, until one recognizes the user.
Several providers can therefore serve one instance — an identity platform for editors and a fixed
list for a break-glass administrator, for example.

:::info[Ensure cookie name is valid]
Some cloud hosting services strip cookies from requests and allow only specific ones. To avoid
breaking auth, set the cookie name to a value that is not stripped.

On **Firebase Hosting** and behind **Google Cloud CDN**, only a cookie named `__session` reaches the
backend:

```ts
authentication: {
    cookieName: '__session'
}
```

Getting this wrong does not fail loudly. Sign-in works, and then every renewal is dropped, so users
are signed out roughly every `accessTokenMinutes` with nothing in the logs to explain it.

GenoaCMS keeps the whole session — access token, refresh token, and the family it belongs to — in
this **one** cookie, so a host that forwards a single cookie is enough. It stays well inside the
4096-byte limit.
:::

:::note[There is no session secret to configure]
Session tokens are signed with a key derived from the root signing seed, so nothing stores or
configures it. Rotating the root therefore signs everyone out — which is intended, since the root is
rotated when it may have been exposed.
:::

:::note[Authorization is not a service]
Authorization used to be a service with cloud adapters, on the assumption that a deployment could
inherit access control from its cloud platform's IAM. It has been removed. Cloud IAM can grant
"read bucket X"; it cannot express which collections or which fields a principal may reach, it
would require a cloud identity for every copywriter and translator, and permissions such as
`pages:publish` have no meaning outside GenoaCMS.

Authentication is federated because *"who are you?"* is a standardized question. Authorization
answers *"what may you do in this application?"*, so it is a core module of GenoaCMS with no
adapters and no configuration stanza.
:::

## Database

The databases GenoaCMS edits, and the collections in each.

```ts
database: {
  providers: Record<string, DatabaseProvider>
  databases: Record<string, { provider: string, collections: CollectionReference[] }>
}
```

Each database names its provider by key. Collections describe data that **already exists** in your
database, so GenoaCMS can edit it in place: `genoa init` puts them in `genoa.config/collections.ts`,
which every config imports.

```ts
import type { CollectionReference } from '@genoacms/contracts/database'
import { storageResource } from '@genoacms/contracts/schemas'

export const collections: CollectionReference[] = [
  {
    name: 'authors',
    primaryKey: { key: 'id', schema: { type: 'string' } },
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        photo: storageResource
      }
    }
  }
]
```

- `name` is the collection's or table's name in the database.
- `primaryKey.key` is the field that identifies a document, and `primaryKey.schema` its type. The AWS adapter accepts only string keys.
- `schema` is a [JSON Schema](https://json-schema.org/) object describing a document; the contract types it as `JsonSchema`.

`@genoacms/contracts/schemas` adds fields that point outside the document: `storageResource` and
`nullableStorageResource` for an object in a bucket, and `reference({ collection })` for a document
of another collection.

:::note[Composed key]
Composed keys are not supported.
:::

## Storage

The buckets GenoaCMS reads and writes, one of which holds its own data.

```ts
storage: {
  providers: Record<string, StorageProvider>
  buckets: Record<string, { provider: string }>
  defaultBucket: string
  pathDelimiter?: string   // default '|->'
}
```

Each key of `buckets` is the name of a bucket that already exists, bound to the provider that serves
it. `defaultBucket` names the bucket where GenoaCMS keeps its own data under `.genoacms/` — see
[what GenoaCMS stores](/guide/storage-layout). `pathDelimiter` separates path segments in the storage
browser's URLs.

:::caution[Default bucket should be private]
The default bucket holds authorization data and signed documents. Keep it private, and put public
assets in a second bucket.
:::

## Secrets

Holds what must live neither in the bucket nor in the config: GenoaCMS's signing seeds, and every
credential a config refers to with `secret()`.

```ts
secrets: {
  providers: Record<string, SecretsProvider>   // exactly one
}
```

:::caution[Exactly one provider]
Only one secret store may be configured. A secret store is a single authority: with two, a write has
no defensible target, and a key present in one but not the other would make behavior depend on
lookup order.
:::

:::warning[The local store is for development]
`@genoacms/adapter-secrets-env` keeps secrets in plaintext in `.genoacms/secrets.env`, and a
production build refuses it. Use a secret manager in production; the contract is identical, so only
the configuration changes. How a config refers to a secret is under [secrets](/guide/config/secrets).
:::

### What GenoaCMS stores here

| Key | Purpose |
| :--- | :--- |
| `GENOACMS_ROOT_KEY_SEED` | The root signing key. See below. |
| `GENOACMS_SUBORDINATE_KEY_SEED_…` | One per signing key, named by its key id. |
| `GENOACMS_KEY_REGISTRY_SEQUENCE` | Guards against an old key registry being restored. |

GenoaCMS creates all of these itself. Nothing here has to be set by hand.

:::note[Subordinate seeds accumulate]
Keys rotate on an interval, so a new `GENOACMS_SUBORDINATE_KEY_SEED_…` appears each time. A seed is
only needed to *sign*, so seeds for superseded keys can be removed — the public key stays in
`.genoacms/keys/public.json`, and everything that key signed keeps verifying. Removing the seed of
the **current** key breaks signing until the next rotation, so check
[`keys/public.json`](/guide/storage-layout) for which key is current before pruning.
:::

### The root signing key

On first start GenoaCMS generates a **root trust anchor** — the key at the top of its signing chain
— and stores its seed as `GENOACMS_ROOT_KEY_SEED`. A line naming the new key's id is written to the
log when this happens:

```
[genoacms:signing] generated a new root trust anchor, keyId 9f2c41ab8d7e0355.
```

Only the seed is stored; the keypair is derived from it at startup. That keeps one short value in
the secret manager rather than a multi-kilobyte key, and holding the seed is equivalent to holding
the key, so nothing is given away by storing the smaller thing.

:::caution[Back up the seed, and treat it as the key]
Losing `GENOACMS_ROOT_KEY_SEED` means losing the trust anchor. GenoaCMS would generate a new one on
the next start, and every consumer holding the old public key would then reject everything this
instance signs — recoverable only by redeploying those consumers.

Anyone who can read the seed can sign as your instance. It belongs in a secret manager with the same
care as a production database credential, never in the repository.
:::

:::note[Starting several instances at once is safe]
Instances that start together do not each generate a key. Creation is an atomic claim: exactly one
wins, and the others wait briefly and adopt its key. An instance that cannot obtain a value fails to
start rather than inventing its own — which would leave two instances signing with keys that
disagree, invisible until a consumer rejected a legitimate artifact.

If startup reports that a key was claimed but never given a value, an earlier instance died part-way
through first-time setup. Delete the key from the secret store so it can be created again.
:::

To provision the key yourself instead of letting it be generated — for a multi-region deployment, or
to keep the anchor under existing key management — write the seed to the secret store before first
start. GenoaCMS generates one only when none is present.


## Languages

The languages components may be authored in, keyed by the language a component records.

```ts
languages: {
  providers: Record<string, LanguageProvider>
}
```

```ts
languages: {
  providers: {
    typescript: languageProvider('@genoacms/language-adapter-ts', { target: 'es2020' })
  }
}
```

A component records its language, and GenoaCMS resolves the adapter from it, so several languages can
coexist. See [adding a language](/guide/language-adapters).

## Deployment

Where `genoa build` and `genoa deploy` send GenoaCMS.

```ts
deployment?: {
  targets: Record<string, DeploymentTarget>
  default?: string
}
```

A target is an adapter that knows how to build for and publish to one platform. `genoa deploy gcp`
picks the target by key; without one it takes `default`, else the first key. A config used only by
`genoa dev` may leave the stanza out; a build requires it.

A target's options — credentials included — are read only on the machine running `genoa deploy`.
They never enter the build.

## Authorization and security

Neither is a service: they configure GenoaCMS itself.

```ts
authorization: {
  roles?: Record<string, Grant[]>
  assignments?: Record<string, string[]>
  lockRoles?: boolean
}

security: {
  accessTokenMinutes?: number           // default 15
  refreshTokenDays?: number             // default 14
  grantCacheSeconds?: number            // default 30
  subordinateKeyRotationDays?: number   // default 90
  maxFuel?: number                      // default 1 000 000
  maxDepth?: number                     // default 100
  maxAllocation?: number                // default 10 000 000
  fetchOrigins?: string[]               // default [], which permits nothing
}
```

`maxFuel`, `maxDepth` and `maxAllocation` are the ceilings a dynamic component runs under: loop
iterations and recursive branches per render, call depth, and elements and bytes allocated per render.
They are compiled into each published component and covered by its signature, so a consumer may run
below them but never above. `fetchOrigins` lists the origins — scheme, host and optional port — a
dynamic component's data bridge may reach.

Two stanzas rather than one, because they behave oppositely: everything in `authorization` is
**authority**, re-read on every resolution, while everything in `security` is a **seed** consumed
once at first start.

`roles` declares roles by name; `assignments` maps a **subject** to the roles it holds. A subject is
the provider-issued identifier from the authentication service, never an email address.

A new instance needs at least one assignment, or nobody can administer it:

```ts
authorization: {
  roles: {
    Administrator: [{ permission: '*', resource: '*' }]
  },
  assignments: {
    'the-subject-of-your-first-administrator': ['Administrator']
  }
}
```

:::caution[Declarations are authoritative and immutable]
What `genoa.config` declares cannot be changed through the CMS. Editing or deleting a declared role
or assignment at runtime is **refused**, not silently reverted later.

Both are resolved **without reading storage**, so they still apply on an instance whose stored
authorization data is missing or cannot be trusted — which is what makes them the way back in.

Removing a declaration removes it from the instance. Deleting a line here revokes the access it
granted; it does not leave an editable copy behind.
:::

Runtime administration remains free to create roles and assignments that `genoa.config` does not
name. Set `authorization.lockRoles` to `true` to disable runtime administration entirely, for an
instance whose authorization should be fixed at deployment — it sits beside the declarations because
it governs exactly them.

`security.subordinateKeyRotationDays` sets how long a signing key stays current — see
[key rotation](/guide/cli).

:::note[These are seed values, not the live ones]
The `security` stanza supplies the values a new instance starts from. They are then held in a signed document
in the bucket ([`security/policy.json`](/guide/storage-layout)), which is what a running instance
reads and what an administrator changes at runtime.

Editing `genoa.config` afterwards therefore has no effect on an instance that has already started.
:::

## When a config does not load

The loader reports every problem at once, each with the path of the offending field, under
`config/invalid`. Each problem has one of these codes:

| Code | Raised when |
| :--- | :--- |
| `config/not-found` | no config file exists where it was looked for |
| `config/evaluation-failed` | the file throws while it is evaluated, or imports something missing |
| `config/not-an-object` | the default export is not a plain object |
| `config/missing-stanza` | a required stanza is absent or not an object |
| `config/invalid-provider-entry` | a provider entry is not `{ adapter, options }`; use the helpers |
| `config/descriptor-not-found` | the adapter specifier cannot be loaded; is the package installed? |
| `config/descriptor-invalid` | the module at the specifier is not an adapter descriptor |
| `config/kind-mismatch` | an adapter is used in the wrong stanza, such as a storage adapter under `database` |
| `config/invalid-options` | the adapter's own validation refused the options; the message gives its reason |
| `config/not-serializable` | an option holds something that is not data, such as a function or a class instance |
| `config/bare-secret` | a credential option holds a plain value; wrap it in `secret()`, `env()` or `inline()` |
| `config/misplaced-reference` | a reference sits in an option the adapter does not declare as a credential |
| `config/bootstrap-secret` | the secrets provider's own options use `secret()` |
| `config/invalid-secret-key` | a `secret()` key does not match `[A-Za-z_][A-Za-z0-9_]*` |
| `config/secrets-provider-count` | `secrets.providers` holds no provider, or more than one |
| `config/unknown-provider` | a bucket, database or `deployment.default` names a key that does not exist |
| `config/unknown-bucket` | `defaultBucket` is not a key of `buckets` |
| `config/integer-key` | a provider, bucket or database key is an integer, which JavaScript reorders |
| `config/development-only` | a production build uses a development-only adapter |
| `config/inline` | a warning, in production: an `inline()` value is written into the build |
| `config/inline-forbidden` | `--no-inline` was given and the config uses `inline()` |

At build time, `config/unknown-target` means the target named on the command line is not a key of
`deployment.targets`, and `config/no-deployment-target` that a target was requested from a config
that declares none.
