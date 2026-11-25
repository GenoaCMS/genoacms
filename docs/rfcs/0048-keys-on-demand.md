---
type: rfc
number: 48
title: Keys on demand, bound by their full digest, with a consumer's rollback mark
status: auditing
commits: [0d2fa496]
audit: []
depends: []
architecture: [architecture/signing.md]
changes: [ENV-6 added, REG-1 added, REG-2 added, REG-3 added, REG-4 added, REG-5 added, REG-6 added, VFY-1 added, VFY-2 added, VFY-3 added]
commit-subject: "feat(core,sdk)!: a key manifest with one file per key, and a consumer's rollback mark (RFC-0048)"
---

# RFC-0048: Keys on demand, bound by their full digest, with a consumer's rollback mark

## Summary

`signing.md` YF5: every consumer downloads every public key the instance ever made, 160,892 bytes
on 2026-11-25 for 55 keys, to verify a page signed by one. YF2: neither verifier compares the
envelope's algorithm with the one its key was registered with. YF6: the SDK accepts an older
registry on every fresh load, so every revocation made since can be undone by whoever can write the
storage or answer for it.

The author decided on 2026-11-25 (YU2):

1. The registry becomes a **key manifest**, `genoacms.keyRegistry.v2` at the same path, listing each
   key's id, algorithm, the full SHA-256 of its public key and its moments, and no key (REG-1).
2. Each key that is not revoked has a **key file**, `.genoacms/keys/public/<keyId>.json`, unsigned,
   bound by the manifest's digest, written once and never changed (REG-2). Revoking deletes it
   (REG-3).
3. A verifier, core's and the SDK's, finds the entry, refuses an unknown or revoked key and an
   algorithm other than the registered one **before fetching anything**, then reads the key file
   once and checks it against the entry (ENV-6, VFY-1).
4. **A hard break.** Neither core nor the SDK reads both types. Core refuses a v1 registry with
   `registry/needs-migration` (REG-6). Migrating the stored documents is not part of GenoaCMS: the
   author migrates the author's own deployments with a script outside this RFC (YD10).
5. The secret `GENOACMS_KEY_REGISTRY_SEQUENCE`, its name and its format, becomes part of the
   contract (REG-4). `new Verifier({ …, minimumRegistrySequence })` takes it, and refuses a manifest
   below it (VFY-2).
6. The Svelte demo, the one demo with a server, reads that secret and passes it to the verifier in
   the browser. The demos' artifact proxy serves key files as immutable.

With the live registry, a page signed by one key costs the manifest, about 22 KB (55 entries of
about 200 bytes and the root signature's 10,476), and one key file of about 2.7 KB, instead of
161 KB. A revoked key costs its entry only.

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/core/src/lib/script/signing/envelope.ts` | `DOCUMENT_TYPES` replaces `'genoacms.keyRegistry.v1'` with `'genoacms.keyRegistry.v2'`; `verify` takes a `VerificationKey` instead of a bare public key and checks ENV-6 |
| `packages/core/src/lib/script/signing/registry.ts` | the v2 manifest: `KeyManifest`, `RegisteredKey`, `parseKeyManifest`; `withRotatedKey`, `withRevokedKey`, `currentKey`, `findKey`, `isRevoked`, `toPayload` on the manifest; `findPublicKey` removed |
| `packages/core/src/lib/script/signing/algorithms.ts` | `SUBORDINATE_ALGORITHM` has the literal type `'ML-DSA-65'`, so a `RegisteredKey` can be built from it |
| `packages/core/src/lib/script/signing/keyAdministration.test.ts` | its fixtures typed as `KeyManifest` and `RegisteredKey`; no assertion changes |
| `packages/core/src/lib/script/signing/keyFile.ts` | new: `KeyFile`, `keyFilePath`, `toKeyFile`, `parseKeyFile` (REG-2) |
| `packages/core/src/lib/script/signing/keyFile.server.ts` | new: `writeKeyFile`, `readKeyFile`, `deleteKeyFile` |
| `packages/core/src/lib/script/signing/registry.server.ts` | v2; REG-6's refusal; REG-3's write orders |
| `packages/core/src/lib/script/signing/registrySequence.server.ts` | REG-4's format for the mark |
| `packages/core/src/lib/script/signing/keyResolver.ts` | resolves a key id to a `VerificationKey` through the manifest and the key file, by VFY-1 |
| `packages/core/src/lib/script/signing/keyResolution.server.ts` | `resolveVerificationKey` answers `KeyResolution` |
| `packages/core/src/lib/script/signing/signedDocument.server.ts` | passes the resolved key, and the root's algorithm for root documents |
| `packages/core/src/lib/script/signing/rootRotation.server.ts` | REG-5: the v2 manifest and its one key file |
| `packages/core/src/lib/script/authorization/resolution.server.ts` | `readSignedManifest` uses `KeyResolution` |
| `packages/core/src/lib/script/testing/signingKeys.ts` | `testKeyResolution.resolveVerificationKey` answers `KeyResolution` |
| `packages/core/scripts/generate-conformance.ts` | `verify` with a `VerificationKey`; the corpus it prints stays byte for byte the same |
| `packages/core/src/lib/script/signing/README.md` | the manifest and the key files |
| `packages/core/src/lib/script/signing/envelope.test.ts`, `canonical.test.ts`, `algorithms.test.ts`, `keyId.test.ts` | the tests below; existing tests gain the ENV IDs in their titles and `VerificationKey` arguments; two assertions change (§Tests) |
| `packages/core/src/lib/script/signing/registry.test.ts`, `keyResolver.test.ts` | rewritten for the manifest, by §Tests |
| `packages/core/src/lib/script/signing/keyFile.test.ts`, `registry.server.test.ts`, `registrySequence.server.test.ts` | new, by §Tests |
| `packages/core/src/lib/script/bootstrap.test.ts`, `authorization/signedManifests.test.ts`, `agents/administration.server.test.ts`, `components/publication/publishing.test.ts`, `components/publication/index.test.ts`, `components/page/tree/io.server.test.ts`, `configuration/accounts.server.test.ts`, `database/database.server.test.ts`, `signing/subordinateKey.test.ts` | `verify` and `resolveVerificationKey` with their new arguments and answers; no assertion changes |
| `packages/core/e2e/signing.ts`, `packages/core/e2e/mcp.test.ts`, `packages/core/e2e/configuration.test.ts` | read the manifest and the key files; the REG-3 browser tests |
| `packages/sdk/src/verify/envelope.ts` | `verifyEnvelope` takes `{ alg, publicKey }` and checks ENV-6 |
| `packages/sdk/src/verify/registry.ts` | `KEY_REGISTRY_DOCUMENT` is v2; `readRegistry` by REG-1; `readKeyFile` by REG-2; `resolveKey` removed |
| `packages/sdk/src/verify/client.ts` | `minimumRegistrySequence` (VFY-2); `KEY_FILE_PATH`; VFY-1's order, with the key files cached per verifier |
| `packages/sdk/src/verify/index.ts` | exports `keyFilePath`, `KeyFile`, and no `resolveKey` |
| `packages/sdk/src/verify/client.test.ts`, `attacks.test.ts`, `interop.test.ts`, `registry.test.ts` (new) | by §Tests; the existing fixtures publish a v2 manifest and key files |
| `packages/demo-support/src/artifacts.ts`, `artifacts.test.ts` | the allowlist admits key files |
| `packages/demo-support/src/bucket.ts`, `bucket.test.ts` | `isImmutable` covers key files |
| `packages/demo-support/src/page.ts` | `loadPage(settings, options?)` passes `minimumRegistrySequence` |
| `packages/demo-svelte/src/routes/+page.server.ts` (new), `+page.svelte`, `src/env.ts`, `package.json` | the Svelte demo reads the mark and passes it |
| `packages/demo-deploy/build.sh`, `functions/package.json`, `README.md` | the secret's name in the function's environment; the read-only grant |
| `packages/docs/src/routes/reference/sdk/documents/+page.md`, `guide/storage-layout/+page.md`, `guide/config/services/+page.md` | the manifest, the key files, `minimumRegistrySequence` |
| `.changeset/keys-on-demand.md` | `@genoacms/core` minor and `@genoacms/sdk` minor, each saying that a v1 registry is no longer read |
| `docs/architecture/signing.md` | after the code: the statements current, YF2 and YF5 fixed, YF6 narrowed, test files named, `verified` |
| `docs/README.md`, `docs/rfcs/README.md` | the rows of `signing.md` and this RFC |

## Specification

New statements, as `signing.md` holds them in this RFC's architecture commit: ENV-6, REG-1 to
REG-6 and VFY-1 to VFY-3.

### Core

```ts
// envelope.ts
interface VerificationKey {
  alg: AlgorithmName
  publicKey: Uint8Array
}

function verify<T extends JsonValue> (
  candidate: unknown, expectedType: DocumentType, key: VerificationKey
): VerificationResult<T>
```

`verify` checks, in this order: ENV-1 (`readEnvelope`, unchanged); the type; **then**
`envelope.alg === key.alg`, else
`envelope-algorithm-mismatch: ${envelope.keyId} is registered for ${key.alg}, the envelope names ${envelope.alg}`;
then the base64, the canonical form and the signature, under `key.alg`.

```ts
// registry.ts
interface RegisteredKey {
  keyId: string
  alg: 'ML-DSA-65'
  digest: string
  createdAt: number
  supersededAt?: number
  revokedAt?: number
}

interface KeyManifest {
  sequence: number
  current: string
  keys: RegisteredKey[]
}

type ManifestParseResult = { ok: true, manifest: KeyManifest } | { ok: false, reason: string }

function parseKeyManifest (payload: unknown): ManifestParseResult
function digestOf (publicKey: Uint8Array): string
```

`parseKeyManifest` keeps the reasons of today's `parseKeyRegistry` where a rule is unchanged, and
adds, in REG-1's order: `keys[<i>].alg must be ML-DSA-65, not <alg>`,
`keys[<i>].digest is not 64 lowercase hexadecimal characters`,
`keys[<i>].digest does not begin with its keyId`. The entry's `publicKey` member is gone, so a v1
entry fails with `keys[<i>] has unexpected fields: publicKey`. `digestOf` is the lowercase hex
SHA-256 of the raw key. `withRotatedKey(manifest, entry, at)` and `withRevokedKey(manifest, keyId,
at)` behave as today, on `RegisteredKey`.

```ts
// keyFile.ts
interface KeyFile {
  keyId: string
  alg: 'ML-DSA-65'
  publicKey: string
}

function keyFilePath (keyId: string): string   // '.genoacms/keys/public/<keyId>.json'
function toKeyFile (keyId: string, alg: 'ML-DSA-65', publicKey: Uint8Array): KeyFile
function parseKeyFile (entry: RegisteredKey, candidate: unknown): { ok: true, key: VerificationKey } | { ok: false, reason: string }
```

`parseKeyFile` refuses with `key-file-mismatch: <keyId> <member> does not match the key manifest`,
`<member>` the first of `shape`, `keyId`, `alg`, `publicKey` that fails: `shape` when the candidate
is not an object of exactly the three members, `publicKey` when it is not strict base64 (ENV-1), is
not ML-DSA-65's 1952 bytes, or its digest differs from the entry's.

```ts
// keyFile.server.ts
async function writeKeyFile (file: KeyFile): Promise<void>        // REG-3: ifAbsent; identical bytes count as written
async function readKeyFile (keyId: string): Promise<unknown | undefined>  // undefined only for ObjectNotFoundError
async function deleteKeyFile (keyId: string): Promise<void>       // an absent file is not an error
```

`writeKeyFile`, when the conditional write fails its precondition, reads the stored file and
returns if its text is the same JSON (`JSON.stringify` of the same `KeyFile`, members in the order
`keyId`, `alg`, `publicKey`), else throws `registry/key-file-conflict: <keyId>`. Key files are
written with `uploadInternalObjectJSON`, as the manifest is.

```ts
// registry.server.ts
async function loadRegistry (): Promise<RegistryLoadResult>            // v2 only; REG-4, REG-6
async function writeRegistry (manifest: KeyManifest, expected?: string): Promise<void>
async function rotateSubordinateKey (): Promise<KeyManifest>          // key file, manifest, mark
async function revokeSubordinateKey (keyId: string): Promise<KeyManifest> // manifest, mark, key file, seed
```

`loadRegistry` compares the parsed document's `type` member with `genoacms.keyRegistry.v1` before
verifying, and for that type returns
`{ ok: false, absent: false, reason: 'registry/needs-migration: .genoacms/keys/public.json is genoacms.keyRegistry.v1, which this version of core does not read' }`,
and `loadOrBootstrapRegistry` throws `registry/unusable: <reason>` with it, as for any registry that
exists and does not verify. The bootstrap of an instance with no registry writes the first key's
file before the manifest.

```ts
// registrySequence.server.ts
const MARK_FORMAT = /^(0|[1-9][0-9]*)$/
```

`readHighWaterMark` refuses a value that does not match with today's
`registry-sequence/unreadable` message.

```ts
// keyResolver.ts, keyResolution.server.ts
type KeyResolution = { ok: true, key: VerificationKey } | { ok: false, reason: string }

async function resolveVerificationKey (keyId: string): Promise<KeyResolution>
```

`KeyResolver` keeps its manifest cache, its refresh on an unknown id and its rate limit. For a
listed key that is not revoked it reads the key file once per process and remembers the
`KeyResolution`, keyed by key id and digest; a read that throws is not remembered and propagates.
The refusals, by VFY-1: `key-unresolvable: <keyId> is unknown or revoked`,
`key-file-absent: <keyId>`, and `parseKeyFile`'s. A manifest that revokes a key drops its
remembered resolution. `readSignedDocument` and `readSignedManifest` return `{ ok: false }` with
the refusal's reason, as a verdict; `readRootSignedDocument` verifies with
`{ alg: ROOT_ALGORITHM, publicKey: root.publicKey }`.

`rotateRootKey` writes, in order: the root seed, the new subordinate key's file, the manifest
(unconditional, v2, sequence = mark + 1), the mark, the policy. It deletes no key file.

### SDK

```ts
// envelope.ts
const verifyEnvelope = (
  candidate: unknown, expectedType: string, key: { alg: string, publicKey: Uint8Array }
): Verdict<JsonValue>
```

with ENV-6's reason, checked where core checks it.

```ts
// registry.ts
const KEY_REGISTRY_DOCUMENT = 'genoacms.keyRegistry.v2'

interface RegistryKey {
  keyId: string
  alg: 'ML-DSA-65'
  digest: string
  createdAt: number
  supersededAt?: number
  revokedAt?: number
}

interface KeyRegistry { sequence: number, current: string, keys: RegistryKey[] }

const readRegistry = (payload: JsonValue): KeyRegistry | string
const readKeyFile = (entry: RegistryKey, candidate: unknown): { alg: 'ML-DSA-65', publicKey: Uint8Array } | string
```

`readRegistry` applies every rule of REG-1, as today in kebab-case reasons, adding
`registry-unexpected-member: <member>`, `registry-entry-unexpected-member: <keyId> <member>`,
`registry-keys-empty`, `registry-entry-wrong-algorithm: <keyId> <alg>`,
`registry-entry-digest-malformed: <keyId>` and `registry-entry-digest-mismatch: <keyId>` (the
digest does not begin with the key id). `readKeyFile` returns REG-2's
`key-file-mismatch: <keyId> <member> does not match the key manifest`.

```ts
// client.ts
interface VerifierOptions {
  rootPublicKey: Uint8Array
  source: Source
  platforms?: readonly string[]
  /**
   * The value of the secret `GENOACMS_KEY_REGISTRY_SEQUENCE`, read by the consumer where it can be.
   * A manifest with a lower sequence is refused (VFY-2).
   */
  minimumRegistrySequence?: number
}

const keyFilePath = (keyId: string): string => `.genoacms/keys/public/${keyId}.json`
```

The constructor throws `new TypeError('minimumRegistrySequence must be a non-negative integer')`
unless the option is absent or `Number.isSafeInteger(value) && value >= 0`, and starts
`#highWaterMark` at it. `loadRegistry` refuses with
`registry-rollback: sequence ${sequence} is below ${highWaterMark}`. `verifyDocument` follows
VFY-1: the entry (`key-unresolvable: <keyId> is unknown or revoked`), ENV-6 against the entry's
`alg`, then the key file through `#keyFor(entry)`, which keeps one `Promise` per key id and digest,
dropped when it rejects, so a failure to read is retried and a verdict is not. An absent key file
(`source.read` answers `undefined`) is the verdict `key-file-absent: <keyId>`; a key file that is
not JSON throws `UnreachableError('not-json', …)`, as any document does.

### Consumers in this repository

- `demo-support/src/artifacts.ts`: `KEY_FILE = /^\.genoacms\/keys\/public\/[0-9a-f]{16}\.json$/`,
  and `isPublishedDocument` admits it.
- `demo-support/src/bucket.ts`: `isImmutable` is true for `.genoacms/components/public/` and for
  `KEY_FILE`, so a key file is served with `public, max-age=31536000, immutable`; the manifest
  stays `no-store`.
- `demo-support/src/page.ts`: `loadPage(settings, options?: { minimumRegistrySequence?: number })`
  passes the option to the `Verifier`.
- `demo-svelte/src/routes/+page.server.ts` (new): when `GENOACMS_REGISTRY_SEQUENCE_SECRET` is set,
  to a Secret Manager version name such as
  `projects/genoacms/secrets/GENOACMS_KEY_REGISTRY_SEQUENCE/versions/latest`, `load` reads it with
  `@google-cloud/secret-manager`, using the credentials the bucket reader uses, and returns
  `{ minimumRegistrySequence }`; a value that does not match REG-4's format, or a read that fails,
  answers `error(503, 'The key registry mark could not be read.')`. Unset, it returns `{}`.
  `+page.svelte` takes `data` with `$props()` and passes it to `loadPage`. The page still fetches
  and verifies in the browser.
- `demo-deploy/build.sh` writes `GENOACMS_REGISTRY_SEQUENCE_SECRET` into `functions/.env` beside
  `GENOACMS_BUCKET`, defaulting to the name above.

## Non-goals

- The security policy: RFC-0049.
- Migrating a stored `genoacms.keyRegistry.v1` registry (YD10). Core no longer contains the v1
  parser; the author's script brings its own.
- YF7: the development and test configs still name the production bucket.
- Pruning the manifest: every key stays listed, revoked ones too (REG-1). Its entries are small.
- A version of either verifier that reads v1 (YD7). No compatibility path, no fallback.
- The React, Vue and vanilla demos pass no mark: they have no server, and stay protected within
  one verifier only (YD9).
- A new key id: the key id stays 64 bits and names the key (ENV-4); YD5 explains why.
- Signing the key files (YD6).
- Mirroring the published documents to a public origin; the demos' proxy stays.

## Tests

`packages/core/src/lib/script/signing/envelope.test.ts` (unit). Every existing test gains the
ENV ID of what it checks in its title: the round trip and the canonical form ENV-2, the refusals
before the signature ENV-1, the rest ENV-5. `rejects a rewritten algorithm` becomes
`ENV-6: rejects a rewritten algorithm before checking the signature`, and its assertion changes
from `valid: false` to `{ valid: false, reason: 'envelope-algorithm-mismatch: <keyId> is registered for ML-DSA-65, the envelope names SLH-DSA-SHA2-128s' }`.
`ENV-1: recognizes the three documents that are signed` asserts `genoacms.keyRegistry.v2` a
document type and `genoacms.keyRegistry.v1` not one, where it asserted v1 one. New:

- `ENV-6: a signature by a key registered for another algorithm does not verify`: given an envelope
  signed with an SLH-DSA-SHA2-128s key, when verified with that key's public key and
  `alg: 'ML-DSA-65'`, then `envelope-algorithm-mismatch`, even though the signature is genuine.
- `ENV-6: the algorithm is checked after the type`: given an envelope of another type and another
  algorithm, then `envelope-wrong-type`.

`canonical.test.ts`, `algorithms.test.ts`, `keyId.test.ts` (unit): existing tests gain ENV-2,
ENV-3 and ENV-4 in their titles; no assertion changes.

`registry.test.ts` (unit), rewritten for `parseKeyManifest`:

- `REG-1: accepts a manifest of one current key`: given an entry built with `digestOf`, then
  `{ ok: true }` with the same manifest.
- `REG-1: refuses a v1 entry that still carries its public key`: then
  `keys[0] has unexpected fields: publicKey`.
- `REG-1: refuses a digest that is not 64 lowercase hexadecimal characters`: for 63 characters, 65,
  and an uppercase digest, each `keys[0].digest is not 64 lowercase hexadecimal characters`.
- `REG-1: refuses a key id that is not the beginning of the digest`: then
  `keys[0].digest does not begin with its keyId`.
- `REG-1: refuses any algorithm but ML-DSA-65`: for `SLH-DSA-SHA2-128s`, then
  `keys[0].alg must be ML-DSA-65, not SLH-DSA-SHA2-128s`.
- `REG-1: refuses null for an unset moment`, `REG-1: refuses an empty key list`,
  `REG-1: refuses a key listed twice`, `REG-1: refuses a current key that is superseded or revoked`,
  `REG-1: refuses a sequence below 1`, `REG-1: refuses an unexpected member of the manifest`: each
  with today's reason.
- `REG-1: a rotation supersedes the current key and keeps every entry`, and
  `REG-1: a revocation keeps the entry and refuses the current key`: today's `withRotatedKey` and
  `withRevokedKey` tests, on entries with a digest.

`keyFile.test.ts` (unit), new:

- `REG-2: accepts the key file of a listed key`: given an entry and `toKeyFile` of its key, then
  `{ ok: true, key: { alg: 'ML-DSA-65', publicKey } }`.
- `REG-2: refuses a key file whose key does not have the entry's digest`: given the file of
  another ML-DSA-65 key under the entry's key id, then
  `key-file-mismatch: <keyId> publicKey does not match the key manifest`.
- `REG-2: refuses a key whose 64-bit id collides but whose digest differs`: given an entry whose
  digest is changed after its first 16 characters, and the genuine key's file, then
  `key-file-mismatch: <keyId> publicKey …`. This is the substitution YD5 closes.
- `REG-2: refuses another key id, another algorithm, a key of the wrong length, loose base64 and an extra member`:
  each with the member REG-2's order names (`keyId`, `alg`, `publicKey`, `publicKey`, `shape`).
- `REG-2: the key file path is the key id under keys/public`: `keyFilePath('0123456789abcdef')` is
  `.genoacms/keys/public/0123456789abcdef.json`.

`registry.server.test.ts` (unit), new, on in-memory storage and in-memory secrets, with the test
root key:

- `REG-3: a rotation writes the new key's file before the manifest, and the mark last`: given a
  bootstrapped instance, when rotating, then the recorded writes are, in order, the key file of the
  new key, the manifest with it current, the mark at the new sequence.
- `REG-3: a rotation that cannot write its key file writes no manifest`: given a different file at
  the new key's path, when rotating, then `registry/key-file-conflict: <keyId>` and the manifest and
  the mark are unchanged.
- `REG-3: a key file already written with the same bytes counts as written`: given the identical
  file at the path, when rotating, then the rotation succeeds.
- `REG-3: a revocation writes the manifest and the mark, then deletes the key file and the seed`:
  given a superseded key, when revoking it, then the writes and deletions are in that order, its
  file and its seed are gone, and its entry has `revokedAt`.
- `REG-3: a revocation whose key file is already gone succeeds`.
- `REG-3: a rotation conditional on a manifest that changed meanwhile fails and writes no mark`:
  given the storage replaces the manifest right after it is read, when rotating, then the
  precondition error, and the mark is unchanged.
- `REG-6: a v1 registry is refused and never rewritten`: given a valid v1
  registry, when loading or bootstrapping, then `registry/needs-migration: … which this version of core does not read`,
  and the stored bytes are unchanged.
- `REG-5: root rotation writes a v2 manifest of one key, its key file first, at the mark plus 1`:
  given the mark at 7, when rotating the root, then the key file, then a manifest signed by the new
  root with sequence 8 and one current key, then the mark at 8.
- `VFY-1: core refuses an unknown or revoked key before reading a key file`: given a manifest that
  revokes key `k`, when resolving `k` and an unlisted id, then `key-unresolvable` for both, and no
  key file was read.
- `VFY-1: core reads a key file once`: when resolving the same key three times concurrently, then
  one read of its file.
- `VFY-1: core reports an absent key file as a verdict`: given a listed key without a file, then
  `{ ok: false, reason: 'key-file-absent: <keyId>' }`, not an exception.

`registrySequence.server.test.ts` (unit), new:

- `REG-4: a mark of another form fails every load`: for `'1e3'`, `' 5'`, `'05'`, `'-1'` and `''`,
  then `registry-sequence/unreadable: GENOACMS_KEY_REGISTRY_SEQUENCE is '<value>'`.
- `REG-4: a manifest below the mark is refused and a higher one raises it`: given the mark 5, a
  manifest of sequence 4 is refused with `registry-rollback: sequence 4 is below the highest seen (5)`,
  and one of 6 loads and leaves the mark at 6.

`packages/core/e2e/configuration.test.ts` (e2e), added to the key screen's tests:

- `KEY-3, REG-3: rotating publishes the new key's file`: when an administrator rotates on the
  screen, then the bucket holds `.genoacms/keys/public/<new keyId>.json`, and the manifest lists the
  key current with the SHA-256 of that file's key as its digest.
- `KEY-4, REG-3: revoking deletes the key's file`: when the administrator revokes the key just
  superseded, then its file is gone, and the manifest lists it revoked.

`packages/sdk/src/verify/registry.test.ts` (unit), new: `VFY-3:` one test per rule of REG-1 as
`readRegistry` reports it, and `VFY-3: refuses a manifest of the type genoacms.keyRegistry.v1`.

`packages/sdk/src/verify/client.test.ts` (unit). The fixture source publishes a v2 manifest and the
key files. Two existing tests change with it. `refuses one signed by anything but the root` signs
the manifest with another SLH-DSA-SHA2-128s key rather than with the subordinate key, which ENV-6
would now refuse before the signature; its assertion stays `envelope-signature-invalid`.
`refuses an entry whose id does not derive from its own key` gives the entry the digest of another
key, and its assertion changes from a reason containing `key-id-mismatch` to one containing
`digest-mismatch`, since a v2 entry carries no public key to derive an id from. New:

- `VFY-1: a revoked or unknown key is refused before any key file is fetched`: then the source was
  asked for the manifest and the document only.
- `VFY-1, ENV-6: an envelope naming another algorithm than its entry is refused before the key file is fetched`.
- `VFY-1: a verifier fetches each key file once, for any number of documents`: given ten page trees
  signed by one key, verified concurrently, then one read of its file.
- `VFY-1: a key file that fails to load is fetched again, and a mismatch is not`: given a source
  that throws once for the file, then the second verification reads it again; given a mismatched
  file, then a second verification reads nothing and gives the same verdict.
- `VFY-1: an absent key file is the verdict key-file-absent`.
- `VFY-2: a manifest below the consumer's mark is refused`: given `minimumRegistrySequence: 80` and
  a manifest at 79, then `registry-rollback: sequence 79 is below 80`.
- `VFY-2: a manifest at or above the consumer's mark is accepted`: at 80 and at 81.
- `VFY-2: an invalid mark fails the constructor`: for `-1`, `1.5`, `NaN`, `'80'` and
  `2 ** 53`, then `TypeError: minimumRegistrySequence must be a non-negative integer`.
- `VFY-2: without a mark, only manifests the same verifier loaded are compared`: two verifiers, one
  loading 81 then 80 (refused), the other loading 80 first (accepted).

`attacks.test.ts` (unit), new:

- `VFY-1, REG-2: a replaced key file under the same key id is refused`: given an attacker who writes
  their own ML-DSA-65 key file at a listed key's path and signs a page tree with it under that key
  id, then the page tree is refused with `key-file-mismatch`.
- `VFY-2: a restored older manifest that un-revokes a key is refused with the consumer's mark`:
  given manifests 10 (key `k` superseded) and 11 (`k` revoked), the mark 11, and the storage serving
  10 and a document signed by `k`, then `registry-rollback`; without the mark, the document
  verifies, which is YF6 left to a consumer that passes none.

`interop.test.ts` (unit): the manifest and key files core writes are read by the SDK, and a page
tree core signs verifies in the SDK, through one in-memory storage.

`packages/demo-support/src/artifacts.test.ts` and `bucket.test.ts` (unit): a key file path is
published and immutable; `.genoacms/keys/public/../secrets.json` and a key id of 15 or 17
characters are not published.

## Steps

1. Baseline: `pnpm -r test`, `node scripts/test-level.mjs e2e`, `node docs/tools/check-docs.mjs docs`;
   record the counts.
2. Tests: written from the Specification and this RFC, those that fail today marked `it.fails`, in
   a session that has not seen the implementation; the ENV IDs added to existing titles; no existing
   assertion changed but the two §Tests names. Commit:
   `test(core,sdk): keys on demand and the consumer's mark (RFC-0048)`.
3. Code, in the Files' order: core's envelope, manifest, key files, storage and resolution;
   the SDK; demo-support; the Svelte demo; the user docs; the changeset. Remove
   the `it.fails` markers and change no assertion. Commit with `commit-subject`.
4. **Stop for the author:** grant the Svelte demo function's service account
   `roles/secretmanager.secretAccessor` on the secret `GENOACMS_KEY_REGISTRY_SEQUENCE` only, and the
   development service account the same, if the demo is to read it locally.
5. Run §Verification. Update `signing.md` (ENV-6, REG, VFY current, with their `Test:` lines; ENV-1
   to ENV-5 naming the tests that now carry their IDs; YF2 and YF5 *History.* and
   `fixed, RFC-0048`; YF6 `narrowed, RFC-0048`; `verified`). Set this RFC to `auditing` with `commits`. Commit:
   `docs: RFC-0048's statements to current`.
6. **Stop for the author**, who migrates and redeploys, in this order: migrate the stored registry
   with the author's own script, to key files and a manifest that REG-1, REG-2 and REG-4 accept, at
   the old sequence plus 1; deploy core; redeploy the four demos with `packages/demo-deploy/build.sh`
   and `firebase deploy`. From the migration until each step after it, the deployed core and the
   deployed demos verify nothing (YD7).
7. Audit ENV-6, REG-1 to REG-6 and VFY-1 to VFY-3 (WORKFLOW §6.3). Findings amend this RFC
   through steps 2 to 5; then `implemented` with `audit`.

## Verification

```bash
pnpm --filter @genoacms/core exec vitest run src/lib/script/signing src/lib/script/authorization src/lib/script/bootstrap.test.ts
# all pass, none marked it.fails
pnpm --filter @genoacms/sdk test
# all pass
pnpm --filter @genoacms/demo-support test
# all pass
pnpm -r test
# all pass; the count is the baseline plus the new tests
node scripts/test-level.mjs e2e
# all pass, the two REG-3 browser tests among them
pnpm --filter @genoacms/core exec vite-node scripts/generate-conformance.ts > /tmp/genoacms-corpus.json
GENOACMS_CONFORMANCE_CORPUS=/tmp/genoacms-corpus.json pnpm --filter @genoacms/sdk run conformance
# all pass; the corpus is the one the baseline generated, byte for byte
node docs/tools/check-docs.mjs docs
# 0 error(s)
```

A falsification audit of each statement this RFC adds or changes (WORKFLOW §6.3), by an agent that
did not write the code, recorded as a Verification entry of `signing.md` and named in `audit`.
Until it finds nothing open, this RFC is `auditing`.

## Critique

**Pros**
- A page signed by one key costs about 25 KB of key material instead of 161 KB with the live
  registry, and the cost of an old or revoked key falls to an entry of about 200 bytes. A key file,
  once fetched, is never fetched again by a cache that honors `immutable`.
- The binding between an entry and its key moves from 64 bits to 256, which holds against a quantum
  second-preimage search as the signature algorithms do (YD5).
- A revoked or unknown key is refused before any request for its key, so revocation also saves the
  request.
- YF2 closes in both verifiers by one rule, and the key that verifies carries its algorithm, so no
  caller can check a signature without it.
- A consumer with a server gets rollback protection across sessions for the cost of one secret read,
  and the SDK stays stateless.

**Cons & trade-offs**
- A hard break: core, every consumer and the stored manifest change together, and between the
  migration and the consumers' redeployment, those consumers verify nothing. A consumer outside this
  repository breaks until it updates the SDK.
- `changes` classifies everything as `added`, because the v1 registry was never specified, so the
  release checker demands only a minor version. The break is real for consumers: the changeset
  marks it, and the release notes must say that a v1 registry is no longer read.
- A verifier makes a second round trip before its first verification with a key it has not seen.
  The SDK starts loading the manifest early (`8acedc65`), but the key file can only be asked for once
  the document's key id and the manifest are both known.
- The mark becomes a contract: renaming the secret, or changing its format, breaks every consumer
  that reads it. A consumer that reads it needs a grant on the instance's secrets service, which
  couples its deployment to the instance's cloud account.
- A consumer that passes the mark must not read the manifest through a cache older than the mark
  (VFY-2), or it refuses a good manifest after every rotation until the cache expires.
- The key file of a key revoked by a revocation that crashed after writing its manifest stays in the
  bucket until an operator deletes it. It verifies nothing, since the manifest revokes it.

**Blindspots & missed edge cases**
- A consumer that reads the mark from a server it trusts less than the instance's secrets service
  gains nothing; one that reads it from the same storage an attacker writes gains nothing either.
  VFY-2 cannot tell where the number came from.
- The mark lags the manifest by one write (REG-4: the manifest first). A crash between the two leaves
  the mark one change behind until core next loads the manifest, and a consumer that reads it in that
  window accepts the manifest from before that change.
- Deleting the manifest of an instance whose mark is above 0 makes core bootstrap a new one at
  sequence 1, with a fresh key, its file and its seed, and then refuse it as a rollback: the
  instance stops signing, which fails closed, but leaves a manifest, a key file and a seed behind
  that an operator has to remove. REG-3 does not refuse the bootstrap by the mark, as POL-1 does
  for the policy.
- YF7 is left open, and it interferes with this RFC: the development server writes the production
  manifest, key files and seeds, and keeps its own mark in a local file, so the production mark and
  the consumers that read it can fall behind what the development server published.
- The live registry carries 54 keys that no live document needs. A migration writes 30 key files
  for the superseded ones; nothing here removes a superseded key that signed nothing alive.
- Core's `KeyResolver` remembers a resolution per process; a key file replaced in the bucket after
  it was read is not noticed until the process restarts. The digest check makes that harmless, but a
  test that replaces a file mid-process would see the old verdict.
