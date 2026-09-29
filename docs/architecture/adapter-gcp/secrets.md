---
type: architecture
title: GCP secrets: Secret Manager
codes: [SEC]
verified: b050b3b
---

# GCP secrets: Secret Manager

Part of the [GCP adapter architecture](README.md). Markers, IDs and test references as defined there.

## Design

### Role

`@genoacms/adapter-gcp/secrets` is the production secrets store on GCP. The host resolves `secret()`
references through it (`configuration.md` §6), and core reads and writes its own signing material
through it directly: the root seed, the registry sequence and the subordinate seeds
(`configuration.md` §6.3). Only one secrets provider may be configured (`configuration.md` non-goal).

**Who overwrites.** `setSecret` is called by root rotation (`GENOACMS_ROOT_KEY_SEED`, once per
rotation) and by the registry sequence (`GENOACMS_KEY_REGISTRY_SEQUENCE`, on every change to the key
registry). Subordinate seeds are claimed with `setSecretIfAbsent` and never overwritten.

### Decisions

**GD4. `setSecret` destroys the versions it supersedes, with a recovery window (GF5).** SEC-7 to
SEC-10.
*Why:* the contract never consults history, so old versions serve nobody and only cost money and
exposure. The recovery window keeps the one real use of history, undoing a bad rotation by hand,
without GenoaCMS depending on it. A failed cleanup is retried by the next overwrite, because SEC-8
destroys every lower enabled version, not only the previous one.
*Cost:* two more permissions for the runtime identity (README, IAM), one of them destructive
(`versions.destroy`), and one extra list call per overwrite. Destruction is irreversible after the
window, so a bad rotation unnoticed for more than 7 days cannot be rolled back from the store, and 7
days is a guess, not an option. A persistent permission gap shows only as warnings while versions keep
accumulating. Secrets created outside GenoaCMS keep whatever destroy TTL the operator gave them. The
cleanup depends on Secret Manager's version resource names and its `state:ENABLED` filter syntax; a
change in either breaks SEC-8, which SEC-9 then reports as warnings.

**Why absence is narrow (SEC-4).** `getSecret` reports `undefined` only for a secret that does not
exist. A caller reads absence as "not configured yet" and generates a replacement, so a disabled key
reported as absent would quietly become a *new* key rather than an error.

**Why claims are two calls (SEC-6).** `createSecret` is the atomic primitive: the name is unique, so
exactly one concurrent caller creates it. Writing the value is a second call, so a crash in between
leaves a name with no value, and the caller polls instead of reading that as absence.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| GF5 | *History.* Superseded versions accumulated: every retired root seed stayed readable and billed, and the registry sequence gained one version per key issuance, indefinitely. | fixed by GD4, RFC-0022 |
| GF16 | **The Secret Manager statements have no contract test** (SEC-3 to SEC-11). Their level includes `contract`; GS4 checks SEC-7 to SEC-9 once, by hand. Until they exist, the results checker fails on every push to `main`, which is therefore not releasable (author, 2026-09-28: the level is kept, not lowered). | open |

### Operations

Secrets created before RFC-0022 have no destroy TTL, so SEC-9 destroys their superseded versions
immediately. Operators set it once per overwritten secret:

```bash
gcloud secrets update <SECRET> --project <projectId> --version-destroy-ttl=604800s
```

### History

*History.* Secret Manager support was added on 2026-08-16 as a `cloudabstraction` secrets service,
then given atomic claims for the root trust anchor. RFC-0007 (2026-09-27) moved the same bodies into
the runtime. RFC-0022 (2026-09-28) added the destroy TTL and the cleanup.

### Verification

- Unit tests, with the SDK mocked, cover the statements marked with a test below.
- **GS4, not run yet (author, live, scratch project):** three `setSecret` calls on one new key leave one enabled version and two disabled versions scheduled for destruction, and `getSecret` returns the third value. It verifies SEC-7 to SEC-9 against the real service.

## Specification

### Descriptor

#### SEC-1 · Descriptor

Specifier `@genoacms/adapter-gcp/secrets`, kind `secrets`. Runtime specifier `@genoacms/adapter-gcp/secrets/runtime`. Options `projectId: string` (required) and `credentials?: BootstrapSecret<ServiceAccount>`, decoded as JSON (`secretOptions: { credentials: 'json' }`). Validation follows COM-2 and COM-3.

- Test: `packages/adapter-gcp/src/secrets/descriptor.test.ts`
- Level: unit

### Runtime

The runtime constructs one `SecretManagerServiceClient({ projectId, credentials? })` per provider
(COM-4). Secret names are `projects/<projectId>/secrets/<key>`, and every method validates `key` with
the contract's `assertValidSecretKey` before any call.

#### SEC-2 · ADC without credentials

Without `credentials`, the client is constructed with `{ projectId }` only (ADC).

- Test: `packages/adapter-gcp/src/secrets/runtime.test.ts`
- Level: unit

#### SEC-3 · Reading the latest version

`getSecret(key)` reads `projects/<p>/secrets/<key>/versions/latest` and returns its payload as a UTF-8 string. A payload of `null` or `undefined` returns `undefined`.

- Test: `packages/adapter-gcp/src/secrets/runtime.test.ts`
- Level: unit, contract

#### SEC-4 · Absence is only NOT_FOUND

`getSecret` returns `undefined` when, and only when, the call fails with gRPC `NOT_FOUND` (5). Every other failure propagates unchanged, including a disabled or destroyed `latest`.

- Test: `packages/adapter-gcp/src/secrets/runtime.test.ts`
- Level: unit, contract

#### SEC-5 · Overwriting

`setSecret(key, value)` ensures the secret exists: `getSecret` on the secret resource; on `NOT_FOUND`, `createSecret` with the resource of SEC-7, where `ALREADY_EXISTS` (6) from a concurrent creator is not an error. It then adds a version with `value` as UTF-8, runs SEC-8 when the added version has a name, and resolves `true`.

- Test: `packages/adapter-gcp/src/secrets/runtime.test.ts`
- Level: unit, contract

#### SEC-6 · Atomic claim

`setSecretIfAbsent(key, value)` calls `createSecret` (resource of SEC-7). `ALREADY_EXISTS` resolves `false` without adding a version. Any other error propagates. On success it adds the version and resolves `true`.

- Test: `packages/adapter-gcp/src/secrets/runtime.test.ts`
- Level: unit, contract

#### SEC-7 · Recovery window on create

**Every secret the adapter creates** has automatic replication and `versionDestroyTtl` of 604800 seconds (7 days).

- Test: `packages/adapter-gcp/src/secrets/runtime.test.ts`
- Level: unit, contract

#### SEC-8 · Destroying superseded versions

After adding a version, `setSecret` lists the secret's versions with filter `state:ENABLED` and destroys, sequentially and in list order, every one whose version number (the last path segment, a positive integer) is lower than the version just added. Higher-numbered versions are kept.

- Test: `packages/adapter-gcp/src/secrets/runtime.test.ts`
- Level: unit, contract

#### SEC-9 · Cleanup is best effort

SEC-8 is best effort. Any error in it, including a version name that is not numbered (`secrets/unexpected-version-name: <name>`), is reported as a warning, `secrets/cleanup-failed: <key>: <message>`, and `setSecret` still resolves `true`.

- Test: `packages/adapter-gcp/src/secrets/runtime.test.ts`
- Level: unit

#### SEC-10 · Claims do not clean up

`setSecretIfAbsent` does no cleanup.

- Test: `packages/adapter-gcp/src/secrets/runtime.test.ts`
- Level: unit

#### SEC-11 · Deleting a secret

`deleteSecret(key)` deletes the secret with all its versions and resolves `true`. `NOT_FOUND` resolves `false`. Other errors propagate.

- Test: `packages/adapter-gcp/src/secrets/runtime.test.ts`
- Level: unit, contract
