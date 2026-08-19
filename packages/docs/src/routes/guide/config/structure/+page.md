---
title: Configuration
---

GenoaCMS is configured in two places, and the difference between them matters more than the shape of
either. This page covers both, and where each setting belongs.

## The two tiers

**Tier 1 is `genoa.config`** — a JS file in your source repository, read at build and boot. It
declares adapters and credentials, and it may declare anything Tier 2 can.

**Tier 2 is a set of signed documents in your primary bucket**, changed at runtime through the CMS
by administrators who hold the governing permission.

| | Tier 1 — `genoa.config` | Tier 2 — signed documents |
| :--- | :--- | :--- |
| Lives in | your repository | `.genoacms/` in the primary bucket |
| Changed by | a deployment | an administrator, at runtime |
| Holds | adapters, credentials, `authorization`, `security` seeds | roles, accounts, security policy |
| Authority | **authoritative** | may add, may not override |

Three rules follow, and they are the whole model:

1. **Anything settable in Tier 2 is settable in Tier 1.** The tiers are not two vocabularies split
   by subject matter. Tier 2 exists so that what was *not* decided before deployment can still be
   administered afterwards.
2. **A Tier-1 declaration is immutable at runtime.** Where `genoa.config` declares something, the
   CMS refuses to change it — refuses at the moment of the attempt, rather than reverting it later.
   A refusal can be answered; a silent revert after the next deployment cannot.
3. **Authority is a floor, not a ceiling.** Tier 2 stays free to create what Tier 1 has not named.

:::note[Adapters are Tier 1 only]
There is no runtime vocabulary for adapters, buckets or credentials. Nothing in the bucket can
change where the CMS stores things or which provider it talks to.
:::

### Declarations, and seeds

Tier 1 holds two kinds of setting with opposite lifetimes, and they live in **two stanzas** so the
shape of the file says which is which:

- **`authorization`** — `roles`, `assignments`, `lockRoles` — is authority. It is re-read on every
  resolution, merged over stored state rather than written into it, and deleting a line *removes*
  what it granted.
- **`security`** — `accessTokenMinutes`, `refreshTokenDays`, `grantCacheSeconds`,
  `subordinateKeyRotationDays` — supplies the values a new instance starts from. After first start
  the live values live in the signed security policy document, and editing `genoa.config` no longer
  moves them.

`lockRoles` sits with the declarations because it governs exactly them: whether what `authorization`
declares may be added to at runtime.

## What is *not* a service

GenoaCMS delegates cloud concerns to adapters: authentication, database, deployment, secrets and
storage. **Authorization is not among them.** It is a core module, its data lives in your own bucket,
and there is no provider to register or adapter to choose.

Only *"who are you?"* is delegated, because it is a standardised question with interchangeable
answers. *"What may you do here?"* is not: permissions are defined over GenoaCMS's own resources —
buckets, collections, components, pages — which no external system can enumerate or evaluate. See
[roles and permissions](/guide/authorization).

## Where the file goes

The entry file is `{projectRoot}/genoa.config/index.js`, exporting a default object typed as
`genoaConfig` from `@genoacms/cloudabstraction`. Each service has its own object naming
[its adapter and settings](/guide/config/services).

## Example structure

```js
/**
 * @type {import('@genoacms/cloudabstraction').genoaConfig}
 */
const config = {
  authentication: {
    providers: [
      { adapter: import('package'), ... }
    ],
    cookieName: '__session'
  },
  database: {
    databases: [
      {
        name: 'myDb',
        providerName: 'myDbProvider',
        collections: [{ ... }]
      }
    ],
    providers: [
      { name: 'myDbProvider', adapter: import('package'), ... }
    ]
  },
  deployment: {
    adapter: import('package'),
    ...
  },
  storage: {
    defaultBucket: 'myBucket',
    buckets: [
      {
        name: 'myBucket',
        providerName: 'myStorageProvider'
      }
    ],
    providers: [
      { name: 'myStorageProvider', adapter: import('package'), ... }
    ]
  },
  secrets: {
    providers: [
      { name: 'local', adapter: import('@genoacms/adapter-secrets-env') }
    ]
  },
  authorization: {
    // Authority: immutable at runtime, and removing a line revokes what it granted.
    roles: {
      Administrator: [{ permission: '*', resource: '*' }]
    },
    assignments: {
      'the-subject-of-your-first-administrator': ['Administrator']
    }
  },
  security: {
    // Seeds: the values a new instance starts from.
    accessTokenMinutes: 15,
    refreshTokenDays: 14,
    grantCacheSeconds: 30,
    subordinateKeyRotationDays: 90
  }
}

export default config
```

A new instance needs at least one assignment, or nobody can administer it. The key is a **subject**,
not an email address — see [identity and sessions](/guide/sessions).
