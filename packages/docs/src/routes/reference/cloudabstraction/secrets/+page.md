---
title: Secrets types
---

The secrets service holds credentials that must not live in the primary storage bucket or in
`genoa.config`: signing keys, the JWT secret, database and storage credentials, third-party tokens.

A bucket is the wrong place for them — it is exposed to permission misconfiguration, appears in
backups, and is administered by more people than a key store is. `genoa.config` is the wrong place
because it is committed to a repository.

Like authentication, this is a genuinely delegable service: every major platform offers an
equivalent, which is precisely the property authorization lacks.

## Adapter

```ts
export declare namespace Adapter {
  type getSecret = (key: string) => Promise<string | undefined>
  type setSecret = (key: string, value: string) => Promise<boolean>
  type deleteSecret = (key: string) => Promise<boolean>
  type setSecretIfAbsent = (key: string, value: string) => Promise<boolean>
}
```

`setSecretIfAbsent` writes only if the key does not exist, **atomically**. Exactly one of any number
of racing callers resolves `true`. It exists so that instances starting concurrently cannot each
generate a root signing key and disagree about which one consumers should trust — a failure that is
invisible until a legitimate artifact is rejected in the field.

:::caution[A claimed key may briefly hold nothing]
Providers that create a key and write its value in two calls can be interrupted between them. A
caller that loses the claim must poll for a bounded period and then **fail**, never read an empty
result as "not configured" — doing so would generate a second key, which is the outcome the
operation prevents.
:::

`getSecret` resolves to `undefined` for a key that does not exist rather than rejecting — absence is
an ordinary answer, not a failure. `deleteSecret` resolves to `false` when the key was already
absent, so deletion is idempotent.

The contract is deliberately a flat key-value store. It maps 1:1 onto every major secret manager,
and it does not expose versioning even where a provider has it — building on a provider-specific
behaviour would defeat the abstraction.

| Platform | `getSecret` | `setSecret` | `deleteSecret` |
| :--- | :--- | :--- | :--- |
| GCP Secret Manager | `accessSecretVersion('.../latest')` | `addSecretVersion` | `deleteSecret` |
| AWS Secrets Manager | `GetSecretValueCommand` | `PutSecretValueCommand` | `DeleteSecretCommand` |
| Azure Key Vault | `getSecret` | `setSecret` | `beginDeleteSecret` |
| HashiCorp Vault | `read('secret/data/…')` | `write('secret/data/…')` | `delete('secret/data/…')` |
| Local `.env` emulator | `process.env[key]`, then the file | write the key to `.env` | remove the key from `.env` |

## Module

```ts
declare module '@genoacms/adapter-*/secrets' {
  import type { Adapter } from './adapter.d'

  const getSecret: Adapter.getSecret
  const setSecret: Adapter.setSecret
  const deleteSecret: Adapter.deleteSecret

  export {
    getSecret,
    setSecret,
    deleteSecret
  }
}

type SecretProvider<Extension extends object = object> = Extension & {
  name: string
  adapterPath: string
  adapter: Promise<typeof Adapter>
}
```

:::caution[Exactly one provider]
Unlike storage and database, only one secret store may be configured. A secret store is a single
authority: with two, `setSecret` has no defensible answer to *"written where?"*, and a key present
in one but not the other would make behaviour depend on lookup order.
:::

## Key names

Keys must match `[A-Za-z_][A-Za-z0-9_]*`.

This is the **intersection** of what the secret managers accept, not the limit of any one of them:
GCP allows `-`, AWS allows `/` and `.`, and an environment variable allows neither. Fixing the
intersection is what makes a key that works against the `.env` emulator in development still work
against a cloud secret manager in production.

The rule is exported from `@genoacms/cloudabstraction/secrets` so every adapter enforces the same
one, and an invalid key throws rather than being normalised — folding `a-b` and `a_b` onto a single
name would silently merge two distinct secrets.

## Available adapters

| Adapter | Notes |
| :--- | :--- |
| `@genoacms/adapter-secrets-env` | Development only. Plaintext `.env` file. |
| `@genoacms/adapter-gcp/secrets` | GCP Secret Manager. Requires `projectId` and `credentials`. |

:::note[Versioning is not part of the contract]
Secret Manager is versioned; this contract is not. A write adds a version and a read always takes
`latest`, so superseded versions accumulate — invisible to GenoaCMS, but still billed and still
readable by anyone with project access. Set a retention policy at the project level if that matters.

Building the contract on version history would have left it unimplementable against stores that have
none.
:::

:::note[Backend only]
Secrets are read on the GenoaCMS server. Dynamic components and consumer client SDKs have no access
to them.
:::
