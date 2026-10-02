---
type: architecture
title: AWS secrets: Secrets Manager
codes: [ASM]
verified: 1796b78
---

# AWS secrets: Secrets Manager

Part of the [AWS adapter architecture](README.md). Markers, IDs and test references as defined there.

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
*Why:* core deletes a subordinate seed so that nothing can sign with it again; a recovery window
would keep it restorable, and its name taken, for 7 to 30 days. GCP deletes a secret immediately too.
*Cost:* a deleted secret cannot be restored.

**WD6. A secret scheduled for deletion is absent (WU5; ASM-3, ASM-6; WF24).** Reading a secret that
`DescribeSecret` shows with a `DeletedDate` resolves `undefined`, and deleting it again resolves
`false`. The delete does not wait for Secrets Manager to finish.
*Why:* a forced delete completes asynchronously, after anything from under a second to about 30
seconds (WS6), and until then reading the name fails with `InvalidRequestException`. Core deletes a
subordinate seed and later expects `getSecret` of it to resolve `undefined`, and ignores the
delete's result. Waiting in the delete could outlast a request on a function with the default
30-second timeout. A forced delete of a name that does not exist succeeds (WS6), so `false` needs
the `DescribeSecret` before it.
*Cost:* Secrets Manager's reads are eventually consistent: in a rare moment right after a forced
delete, `DescribeSecret` can still show the secret live, and deleting it again then resolves `true`
(WF27). Its result is exact for a name that never existed, and for one deleted earlier only once
the delete is visible. A write or claim of the same name fails with `InvalidRequestException` until the delete
completes; core never reuses a seed's name. A read of a secret scheduled for deletion costs a second
call, and so does every delete. A secret scheduled for deletion outside GenoaCMS, with a recovery
window, also reads as absent.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| WF14 | **No secrets provider.** An AWS stack must take its secrets from another provider, such as the environment, which cannot claim atomically, so two instances starting together can each mint a root seed. `configuration.md` notes that the AWS suite's `production.ts` names a secrets adapter that does not exist. | fixed, RFC-0026 |
| WF27 | *History.* **Deleting a secret just deleted can resolve `true`** (ASM-6, WS8). In CI run 36985809717 on `main` (2026-10-02), the contract test deleted a secret, read it as `undefined`, then deleted it again and got `true`: the `DescribeSecret` of the second delete showed the secret live, although the read before it had seen it deleted. ASM-6 said `false`. | fixed, RFC-0029 |
| WF24 | **A deleted secret is not gone at once, and deleting a missing one succeeds** (ASM-3, ASM-6, WS6). RFC-0026's contract test read a secret right after its forced delete and got `InvalidRequestException`, "marked for deletion", instead of `undefined`. Once the delete had completed, a second forced delete resolved, so `deleteSecret` reported `true` where ASM-6 says `false`. | fixed, RFC-0026 |

### History

*History.* RFC-0026 (2026-10-01) added the provider (WF14), and its first contract run changed how a deleted secret reads (WD6, WF24). A contract run on `main` the next day showed that a second delete can still see the secret (WF27).

### Verification

- **Established from AWS's documentation, not by experiment:** `CreateSecret` of an existing name fails with `ResourceExistsException`; `GetSecretValue` of a missing secret fails with `ResourceNotFoundException`, and of a secret scheduled for deletion with `InvalidRequestException`; storage is billed per secret per month, prorated by the hour, plus per 10,000 API calls.
- **WS6, for ASM-3 and ASM-6: run 2026-10-01, `eu-central-1`.** Create a secret, delete it with `ForceDeleteWithoutRecovery: true`, then read, describe and write it every 0.25 to 0.5 s. Until the delete completes, `GetSecretValue` and `PutSecretValue` fail with `InvalidRequestException` and `DescribeSecret` shows a `DeletedDate`; from then on all answer `ResourceNotFoundException`, and `CreateSecret` of the same name succeeds. The delete completed after about 0.7 s in three runs, and after 29.5, 27.5 and 15.6 s in three runs an hour later. A forced `DeleteSecret` of a name that never existed, or whose delete had completed, resolves with a `DeletionDate`; with a recovery window it fails with `ResourceNotFoundException`.
- **WS8, for ASM-6: run 2026-10-02, `eu-central-1`.** Create a secret, delete it with `ForceDeleteWithoutRecovery: true`, then describe it in a tight loop until `ResourceNotFoundException`. In 30 runs `DescribeSecret` went from a `DeletedDate` to `ResourceNotFoundException` within about 1 s and never showed the secret live again; together with `GetSecretValue`, 6 more runs showed the same order. The stale read of WF27 is therefore rare, seen once in CI and not reproduced.
- **WS4, for ASM-4: not run.** Overwrite one secret many times within minutes and read the number of its versions. It establishes whether core's key-registry sequence, overwritten on every key issuance, can reach Secrets Manager's version limit.

## Specification

### Descriptor

#### ASM-1 · Descriptor

Specifier `@genoacms/adapter-aws/secrets`, kind `secrets`. Runtime specifier `@genoacms/adapter-aws/secrets/runtime`. Options `region: string` (required) and `credentials?: BootstrapSecret<AwsCredentials>` (`env()` or `inline()` only, `secrets.md` D5), decoded as JSON. Validation follows AWS-2 and AWS-3.

- Test: `packages/adapter-aws/src/secrets/descriptor.test.ts`
- Level: unit

### Runtime

One `SecretsManagerClient` per provider (AWS-4). Every error not named below propagates unchanged
(WD2).

#### ASM-2 · Keys are secret names

A key is used as the secret's `SecretId` and `Name` unchanged. A key Secrets Manager does not accept fails with its error.

- Test: `packages/adapter-aws/src/secrets/runtime.test.ts`, `packages/adapter-aws/test/contract/secrets.test.ts`
- Level: unit, contract

#### ASM-3 · Reading

`getSecret(key)` sends `GetSecretValue` and returns its `SecretString`, the `AWSCURRENT` version's value. It returns `undefined` when, and only when, the call fails with `ResourceNotFoundException`, or fails with `InvalidRequestException` and a `DescribeSecret` of the key then shows a `DeletedDate` or fails with `ResourceNotFoundException` (WD6). Otherwise that `InvalidRequestException` propagates, and so does an error of the `DescribeSecret`. A secret holding only `SecretBinary` throws `secrets/not-a-string: <key>`.

- Test: `packages/adapter-aws/src/secrets/runtime.test.ts`, `packages/adapter-aws/test/contract/secrets.test.ts`
- Level: unit, contract

#### ASM-4 · Overwriting

`setSecret(key, value)` sends `PutSecretValue` with `SecretString: value`. On `ResourceNotFoundException` it sends `CreateSecret` with `Name: key` and `SecretString: value`; if that fails with `ResourceExistsException`, because another caller created it meanwhile, it sends `PutSecretValue` once more. It resolves `true`.

- Test: `packages/adapter-aws/src/secrets/runtime.test.ts`, `packages/adapter-aws/test/contract/secrets.test.ts`
- Level: unit, contract

#### ASM-5 · Atomic claim

`setSecretIfAbsent(key, value)` sends `CreateSecret` with `Name: key` and `SecretString: value`, and resolves `true`. `ResourceExistsException` resolves `false`.

- Test: `packages/adapter-aws/src/secrets/runtime.test.ts`, `packages/adapter-aws/test/contract/secrets.test.ts`
- Level: unit, contract

#### ASM-6 · Deleting

`deleteSecret(key)` sends `DescribeSecret` of the key, and resolves `false` when it fails with `ResourceNotFoundException` or shows a `DeletedDate` (WD6). Any other error of the `DescribeSecret` propagates, and no `DeleteSecret` is sent. Otherwise it sends `DeleteSecret` with `ForceDeleteWithoutRecovery: true` and resolves `true`; `ResourceNotFoundException` from it resolves `false`. It does not wait for the delete to complete. For a secret deleted moments before, `DescribeSecret` can still show it live, and the delete then resolves `true` (WF27); once the delete is visible it resolves `false`.

- Test: `packages/adapter-aws/src/secrets/runtime.test.ts`, `packages/adapter-aws/test/contract/secrets.test.ts`
- Level: unit, contract
