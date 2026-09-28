# GCP secrets: Secret Manager

Part of the [GCP adapter architecture](README.md). Markers, IDs and test references as defined there.
Statement code: `SEC`.

# Design

## 1. Role

`@genoacms/adapter-gcp/secrets` is the production secrets store on GCP. The host resolves `secret()`
references through it (`configuration.md` §6), and core reads and writes its own signing material
through it directly: the root seed, the registry sequence and the subordinate seeds
(`configuration.md` §6.3). Only one secrets provider may be configured (`configuration.md` non-goal).

**Who overwrites.** `setSecret` is called by root rotation (`GENOACMS_ROOT_KEY_SEED`, once per
rotation) and by the registry sequence (`GENOACMS_KEY_REGISTRY_SEQUENCE`, on every change to the key
registry). Subordinate seeds are claimed with `setSecretIfAbsent` and never overwritten.

## 2. Decisions

**GD4. `setSecret` destroys the versions it supersedes, with a recovery window (GF5).** SEC-7 to
SEC-10.
*Why:* the contract never consults history, so old versions serve nobody and only cost money and
exposure. The recovery window keeps the one real use of history, undoing a bad rotation by hand,
without GenoaCMS depending on it.
*Cost:* two more permissions for the runtime identity (README §4), and one extra list call per
overwrite.

**Why absence is narrow (SEC-4).** `getSecret` reports `undefined` only for a secret that does not
exist. A caller reads absence as "not configured yet" and generates a replacement, so a disabled key
reported as absent would quietly become a *new* key rather than an error.

**Why claims are two calls (SEC-6).** `createSecret` is the atomic primitive: the name is unique, so
exactly one concurrent caller creates it. Writing the value is a second call, so a crash in between
leaves a name with no value, and the caller polls instead of reading that as absence.

## 3. Findings

| # | Finding | State |
| :-- | :-- | :-- |
| GF5 | *History.* Superseded versions accumulated: every retired root seed stayed readable and billed, and the registry sequence gained one version per key issuance, indefinitely. | fixed by GD4, RFC-0022 |

## 4. Operations

Secrets created before RFC-0022 have no destroy TTL, so SEC-9 destroys their superseded versions
immediately. Operators set it once per overwritten secret:

```bash
gcloud secrets update <SECRET> --project <projectId> --version-destroy-ttl=604800s
```

## 5. History

*History.* Secret Manager support was added on 2026-08-16 as a `cloudabstraction` secrets service,
then given atomic claims for the root trust anchor. RFC-0007 (2026-09-27) moved the same bodies into
the runtime. RFC-0022 (2026-09-28) added the destroy TTL and the cleanup.

## 6. Verification

- Unit tests, with the SDK mocked, cover the statements marked with a test below.
- **GS4, not run yet (author, live, scratch project):** three `setSecret` calls on one new key leave one enabled version and two disabled versions scheduled for destruction, and `getSecret` returns the third value. It verifies SEC-7 to SEC-9 against the real service.

# Specification

## S1. Descriptor

| # | Statement | Test |
| :-- | :-- | :-- |
| SEC-1 | Specifier `@genoacms/adapter-gcp/secrets`, kind `secrets`. Runtime specifier `@genoacms/adapter-gcp/secrets/runtime`. Options `projectId: string` (required) and `credentials?: BootstrapSecret<ServiceAccount>`, decoded as JSON (`secretOptions: { credentials: 'json' }`). Validation follows COM-2 and COM-3. | `secrets/descriptor.test.ts` › names its runtime…; accepts a project id and refuses unknown keys… |

## S2. Runtime

The runtime constructs one `SecretManagerServiceClient({ projectId, credentials? })` per provider
(COM-4). Secret names are `projects/<projectId>/secrets/<key>`, and every method validates `key` with
the contract's `assertValidSecretKey` before any call.

| # | Statement | Test |
| :-- | :-- | :-- |
| SEC-2 | Without `credentials`, the client is constructed with `{ projectId }` only (ADC). | `secrets/runtime.test.ts` › uses Application Default Credentials… |
| SEC-3 | `getSecret(key)` reads `projects/<p>/secrets/<key>/versions/latest` and returns its payload as a UTF-8 string. A payload of `null` or `undefined` returns `undefined`. | `secrets/runtime.test.ts` › reads a missing secret as undefined… (the path only); payload decoding unverified |
| SEC-4 | `getSecret` returns `undefined` when, and only when, the call fails with gRPC `NOT_FOUND` (5). Every other failure propagates unchanged, including a disabled or destroyed `latest`. | `secrets/runtime.test.ts` › reads a missing secret as undefined, and propagates every other failure |
| SEC-5 | `setSecret(key, value)` ensures the secret exists: `getSecret` on the secret resource; on `NOT_FOUND`, `createSecret` with the resource of SEC-7, where `ALREADY_EXISTS` (6) from a concurrent creator is not an error. It then adds a version with `value` as UTF-8, runs SEC-8 when the added version has a name, and resolves `true`. | creation: `secrets/runtime.test.ts` › creates secrets with a seven-day recovery window…; the rest unverified |
| SEC-6 | `setSecretIfAbsent(key, value)` calls `createSecret` (resource of SEC-7). `ALREADY_EXISTS` resolves `false` without adding a version. Any other error propagates. On success it adds the version and resolves `true`. | `secrets/runtime.test.ts` › loses a claim when the secret already exists; creates secrets with a seven-day recovery window… |
| SEC-7 | **Every secret the adapter creates** has automatic replication and `versionDestroyTtl` of 604800 seconds (7 days). | `secrets/runtime.test.ts` › creates secrets with a seven-day recovery window on both create paths |
| SEC-8 | After adding a version, `setSecret` lists the secret's versions with filter `state:ENABLED` and destroys, sequentially and in list order, every one whose version number (the last path segment, a positive integer) is lower than the version just added. Higher-numbered versions are kept. | `secrets/runtime.test.ts` › destroys only the enabled versions below the one it added |
| SEC-9 | SEC-8 is best effort. Any error in it, including a version name that is not numbered (`secrets/unexpected-version-name: <name>`), is reported as a warning, `secrets/cleanup-failed: <key>: <message>`, and `setSecret` still resolves `true`. | `secrets/runtime.test.ts` › keeps the written value when cleanup fails…; destroys nothing when a version name is not numbered |
| SEC-10 | `setSecretIfAbsent` does no cleanup. | unverified |
| SEC-11 | `deleteSecret(key)` deletes the secret with all its versions and resolves `true`. `NOT_FOUND` resolves `false`. Other errors propagate. | unverified |

## Critique & architectural sanity check: GD4

**Pros**
- Exposure and cost stop growing with use. A retired root seed becomes unreadable after the window, which is what retiring it meant.
- No contract change and no new call path in core. The cleanup lives entirely inside `setSecret`.
- The recovery window turns an irreversible operation into a reversible one for a week.

**Cons & trade-offs**
- Destruction is irreversible after the window. A rotation that went wrong unnoticed for more than 7 days cannot be rolled back from the store.
- The runtime identity gains `versions.destroy`, a destructive permission. It could already overwrite and delete secrets, so the new power is small.
- Best-effort cleanup means a persistent permission gap only shows as warnings, while versions keep accumulating as before.

**Blindspots & missed edge cases**
- **Secrets created outside GenoaCMS** have whatever TTL the operator gave them. GenoaCMS overwrites only its own signing secrets, but the window is not guaranteed for secrets it did not create.
- **Version numbers are parsed** from Secret Manager's resource names, and the `state:ENABLED` filter depends on its filter syntax. A change in either breaks SEC-8, which SEC-9 then reports as warnings.
- **A 7-day window is a guess**, and not an option.
