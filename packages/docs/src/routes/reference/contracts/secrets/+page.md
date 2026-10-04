---
title: Secrets contract
---

The secrets service holds credentials that must not live in the primary storage bucket or in
`genoa.config`: GenoaCMS's signing seeds, and the credentials a config refers to with `secret()`.

A bucket is the wrong place for them — it is exposed to permission misconfiguration, appears in
backups, and is administered by more people than a key store is. `genoa.config` is the wrong place
because it is committed to a repository.

Like authentication, this is a genuinely delegable service: every major platform offers an
equivalent, which is precisely the property authorization lacks.

## Adapter

@include ../../../../../../contracts/src/secrets/adapter.d.ts

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
behavior would defeat the abstraction.

| Platform | `getSecret` | `setSecret` | `deleteSecret` |
| :--- | :--- | :--- | :--- |
| GCP Secret Manager | `accessSecretVersion('.../latest')` | `addSecretVersion`, then destroy the superseded versions | `deleteSecret` |
| AWS Secrets Manager | `GetSecretValueCommand` | `PutSecretValueCommand` | `DeleteSecretCommand` |
| Azure Key Vault | `getSecret` | `setSecret` | `beginDeleteSecret` |
| HashiCorp Vault | `read('secret/data/…')` | `write('secret/data/…')` | `delete('secret/data/…')` |
| `.genoacms/secrets.env` (development) | this process's writes, then `process.env[key]`, then the file | write the key to the file | remove the key from the file |

:::caution[Exactly one provider]
Unlike storage and database, only one secret store may be configured. A secret store is a single
authority: with two, `setSecret` has no defensible answer to *"written where?"*, and a key present
in one but not the other would make behavior depend on lookup order.
:::

## Key names

Keys must match `[A-Za-z_][A-Za-z0-9_]*`.

This is the **intersection** of what the secret managers accept, not the limit of any one of them:
GCP allows `-`, AWS allows `/` and `.`, and an environment variable allows neither. Fixing the
intersection is what makes a key that works against the development store still work
against a cloud secret manager in production.

The rule is exported from `@genoacms/contracts/secrets` so every adapter enforces the same
one, and an invalid key throws rather than being normalized — folding `a-b` and `a_b` onto a single
name would silently merge two distinct secrets.

@include ../../../../../../contracts/src/secrets/index.d.ts

## Available adapters

| Adapter | Notes |
| :--- | :--- |
| `@genoacms/adapter-secrets-env` | Development only. Plaintext `.genoacms/secrets.env`. |
| `@genoacms/adapter-gcp/secrets` | GCP Secret Manager. `projectId`; `credentials` only outside GCP, Application Default Credentials otherwise. |
| `@genoacms/adapter-aws/secrets` | AWS Secrets Manager. `region`; `credentials` only outside AWS, the SDK's default chain otherwise. |

:::note[Versioning is not part of the contract]
Secret Manager is versioned; this contract is not. A read always takes the latest version, and after a
write the GCP adapter destroys the versions it superseded, so old values do not stay readable or
billed. That needs the runtime's permission to list and destroy versions; without it the write still
succeeds, warns, and the versions accumulate.

Building the contract on version history would have left it unimplementable against stores that have
none.
:::

:::note[Backend only]
Secrets are read on the GenoaCMS server. Dynamic components and consumer client SDKs have no access
to them.
:::
