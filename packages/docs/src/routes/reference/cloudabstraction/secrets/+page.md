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
}
```

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
| Local `.env` emulator | `process.env[key]` | write the key to `.env` | remove the key from `.env` |

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

:::note[Backend only]
Secrets are read on the GenoaCMS server. Dynamic components and consumer client SDKs have no access
to them.
:::
