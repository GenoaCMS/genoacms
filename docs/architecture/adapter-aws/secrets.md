---
type: architecture
title: AWS secrets: Secrets Manager
codes: [ASM]
verified: bbb105f
---

# AWS secrets: Secrets Manager

Part of the [AWS adapter architecture](README.md). Markers, IDs and test references as defined there.

**Everything in this document is New.** No AWS secrets provider exists (WF14).

## Design

### Role

`@genoacms/adapter-aws/secrets` will serve GenoaCMS secrets from Secrets Manager (WU3). Core uses a
secrets provider for its signing seeds and key registry: it claims the root seed atomically on first
start, stores one seed per subordinate key, and deletes a seed once no key signs with it.

### Decisions

**A GenoaCMS key is a secret of the same name (ASM-2).** No prefix, no mapping, as on GCP.
*Cost:* the account's other secrets share the namespace; core's names all start with `GENOACMS_`.

**A claim is one call (ASM-5).** `CreateSecret` with the value fails with `ResourceExistsException`
when the secret exists, so the claim and the write are atomic. The contract's caveat, that a claim
can leave a name without a value, does not apply on AWS.

**Superseded values are left to Secrets Manager (ASM-4).** An overwrite adds a version labelled
`AWSCURRENT`; the previous one becomes `AWSPREVIOUS`, and older unlabelled versions are removed by
Secrets Manager itself. Unlike on GCP (`adapter-gcp/secrets.md` GD4), the adapter destroys nothing.
*Cost:* the previous value stays readable through `AWSPREVIOUS`, with no recovery window of its own.
Secrets Manager documents a limit on versions for secrets overwritten more often than every few
minutes (WS4).

**WD5. Secrets are deleted without a recovery window (ASM-6).** `DeleteSecret` with
`ForceDeleteWithoutRecovery: true`.
*Why:* core deletes a subordinate seed and then expects `getSecret` of it to resolve `undefined`. A
secret in its recovery window answers `InvalidRequestException` instead, which would fail every load
of a forgotten key for up to 30 days. GCP deletes a secret immediately too.
*Cost:* a deleted secret cannot be restored.

**WD6. A delete waits until the secret is gone (WU5; ASM-6; WF24).** After `DeleteSecret` the adapter
reads the secret until Secrets Manager answers `ResourceNotFoundException`.
*Why:* a forced delete completes asynchronously. Until it does, reading or writing the name fails
with `InvalidRequestException` (WS6), so core's read after a delete would throw where it expects
`undefined`, and a write of the same key would fail. Waiting in the delete keeps every other method
as for a key that never existed.
*Cost:* a delete takes about a second, and up to 30 seconds before it gives up; deletes are rare
(a seed no key signs with any more).

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| WF14 | **No secrets provider.** An AWS stack must take its secrets from another provider, such as the environment, which cannot claim atomically, so two instances starting together can each mint a root seed. `configuration.md` notes that the AWS suite's `production.ts` names a secrets adapter that does not exist. | open |
| WF24 | **A deleted secret is not gone at once** (ASM-6, WS6). RFC-0026's contract test read a secret right after its forced delete and got `InvalidRequestException`, "marked for deletion", instead of `undefined`. | open |

### History

None: nothing is implemented yet.

### Verification

- **Established from AWS's documentation, not by experiment:** `CreateSecret` of an existing name fails with `ResourceExistsException`; `GetSecretValue` of a missing secret fails with `ResourceNotFoundException`, and of a secret scheduled for deletion with `InvalidRequestException`; storage is billed per secret per month, prorated by the hour, plus per 10,000 API calls.
- **WS6, for ASM-6: run 2026-10-01, `eu-central-1`.** Create a secret, delete it with `ForceDeleteWithoutRecovery: true`, then read, describe and write it every 0.5 s. Three runs: for about 0.7 s after the delete, `GetSecretValue` and `PutSecretValue` fail with `InvalidRequestException` and `DescribeSecret` shows a `DeletedDate`; from then on all answer `ResourceNotFoundException`, and `CreateSecret` of the same name succeeds.
- **WS4, for ASM-4: not run.** Overwrite one secret many times within minutes and read the number of its versions. It establishes whether core's key-registry sequence, overwritten on every key issuance, can reach Secrets Manager's version limit.

## Specification

**New**, all of it: no RFC yet.

### Descriptor

#### ASM-1 · Descriptor

Specifier `@genoacms/adapter-aws/secrets`, kind `secrets`. Runtime specifier `@genoacms/adapter-aws/secrets/runtime`. Options `region: string` (required) and `credentials?: BootstrapSecret<AwsCredentials>` (`env()` or `inline()` only, `configuration.md` D5), decoded as JSON. Validation follows AWS-2 and AWS-3.

- Test: none yet
- Level: unit
- State: new (RFC-0026)

### Runtime

One `SecretsManagerClient` per provider (AWS-4). Every error not named below propagates unchanged
(WD2).

#### ASM-2 · Keys are secret names

A key is used as the secret's `SecretId` and `Name` unchanged. A key Secrets Manager does not accept fails with its error.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### ASM-3 · Reading

`getSecret(key)` sends `GetSecretValue` and returns its `SecretString`, the `AWSCURRENT` version's value. It returns `undefined` when, and only when, the call fails with `ResourceNotFoundException`. A secret holding only `SecretBinary` throws `secrets/not-a-string: <key>`.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### ASM-4 · Overwriting

`setSecret(key, value)` sends `PutSecretValue` with `SecretString: value`. On `ResourceNotFoundException` it sends `CreateSecret` with `Name: key` and `SecretString: value`; if that fails with `ResourceExistsException`, because another caller created it meanwhile, it sends `PutSecretValue` once more. It resolves `true`.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### ASM-5 · Atomic claim

`setSecretIfAbsent(key, value)` sends `CreateSecret` with `Name: key` and `SecretString: value`, and resolves `true`. `ResourceExistsException` resolves `false`.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### ASM-6 · Deleting

`deleteSecret(key)` sends `DeleteSecret` with `ForceDeleteWithoutRecovery: true`; `ResourceNotFoundException` resolves `false`. It then sends `GetSecretValue` of the key every 250 ms, the first at once, while it fails with `InvalidRequestException`, and resolves `true` once it fails with `ResourceNotFoundException` or resolves. Any other error propagates. When `InvalidRequestException` is still answered 30 seconds after the delete, it throws `secrets/delete-timeout: <key>`.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)
