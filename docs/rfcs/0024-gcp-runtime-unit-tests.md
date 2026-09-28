# RFC-0024: Unit tests for every current GCP runtime statement

| | |
| :-- | :-- |
| Status | Draft |
| Depends on | RFC-0022 |
| Architecture | [`adapter-gcp/README.md`](../architecture/adapter-gcp/README.md) GD6; GF12, GF13; STO-4 to STO-12, DB-3 to DB-7, SEC-3, SEC-5, SEC-10, SEC-11, DEP-13 |
| Commit | `test(adapter-gcp): cover every storage, Firestore and secrets statement` |

## 1. Summary

Adds unit tests so that every current runtime statement of `adapter-gcp` names a test. **No
production code changes.** If a test cannot pass against the current code as the statement describes
it, the statement or the code is wrong: stop and report (discovery rule). Do not adjust either.

## 2. Files

All under `packages/adapter-gcp/src/`. **Modify or create only:**

| File | Change |
| :-- | :-- |
| `storage/runtime.test.ts` | extend: §3.1 |
| `storage/urls.test.ts` | **new**: §3.2, the real client library, not mocked |
| `database/runtime.test.ts` | extend: §3.3 |
| `secrets/runtime.test.ts` | extend: §3.4 |
| `deployment/procedure.test.ts` | extend: §3.5 |

## 3. Tests

Each test title below is binding, because the architecture documents cite tests by title. Mocks
follow each file's existing style (`vi.mock` of the SDK module, with `vi.fn` members).

### 3.1 `storage/runtime.test.ts`

Extend the mocked `Storage` so that `bucket(name)` returns an object with `file(name)` and `getFiles`
mocks. `file(name)` returns a mock with `getMetadata`, `createReadStream`, `save`, `move` and
`delete`, and records `name`. Add:

| Title | Asserts (statement) |
| :-- | :-- |
| `reads without a version when the metadata call fails` | `getMetadata` rejects → `getObject` resolves `{ data, version: undefined }` (STO-4) |
| `creates atomically with ifAbsent` | `save` receives `preconditionOpts: { ifGenerationMatch: 0 }` (STO-6) |
| `writes conditionally on ifVersion, passing other options through` | `ifVersion: '5', contentType: 'text/plain'` → `save(stream, { contentType: 'text/plain', preconditionOpts: { ifGenerationMatch: 5 } })` (STO-6) |
| `writes unconditionally without a condition` | `save` options have no `preconditionOpts` (STO-6) |
| `maps a failed precondition to PreconditionFailedError` | `save` rejects with `{ code: 412 }` → rejects with `PreconditionFailedError` and message `storage/precondition-failed: b/n: object already exists` for `ifAbsent`, and `…: object changed since it was read` for `ifVersion`. A rejection with `{ code: 500 }` propagates unchanged (STO-6) |
| `moves and deletes a single object` | `move('new')` and `delete()` are called on the named file (STO-7) |
| `lists one level, hiding placeholders and the directory itself` | `getFiles` is called with `{ autoPaginate: false, prefix: 'd/', maxResults: 10, startOffset: 'd/a', delimiter: '/' }`. From files `d/` (size `'0'`), `d/.folderPlaceholder`, `d/x` (size `'12'`, updated `2026-01-01T00:00:00Z`) and `d/y` (no size), and prefixes `['d/', 'd/sub/']`, the result is `files: [{ name: 'd/x', size: 12, lastModified: new Date('2026-01-01T00:00:00Z') }, { name: 'd/y', size: 0, … }]` and `directories: [{ bucket, name: 'd/sub/' }]` (STO-9) |
| `creates a directory as a placeholder object` | `createDirectory({ bucket, name: 'd' })` saves `''` to `d/.folderPlaceholder` (STO-10) |
| `deletes every object under a directory` | `getFiles({ prefix: 'd/' })` then `delete()` on each returned file (STO-11) |
| `moves every object under a directory, replacing the first occurrence` | files `d/x` and `d/e/d/y` under `d/` moved to `n/` go to `n/x` and `n/e/d/y` (STO-12) |

### 3.2 `storage/urls.test.ts` (new)

Uses the **real** `@google-cloud/storage`, through the runtime, with credentials from a key generated
in the test (`generateKeyPairSync('rsa', { modulusLength: 2048 })`, exported as PKCS#8 PEM,
`client_email: 'cms@p.iam.gserviceaccount.com'`). No network is used: both methods are local.

| Title | Asserts (statement) |
| :-- | :-- |
| `forms the public URL with the name fully encoded` | `getPublicURL({ bucket: 'b', name: 'a/b c.txt' })` is `https://storage.googleapis.com/b/a%2Fb%20c.txt` (STO-5) |
| `signs a V2 read URL locally with a key` | `getSignedURL({ bucket: 'b', name: 'a/b c.txt' }, expires)` starts with `https://storage.googleapis.com/b/a/b%20c.txt?`, and has `GoogleAccessId=cms@p.iam.gserviceaccount.com`, `Expires=<Math.floor(expires / 1000)>` (or the value the library rounds to, asserted from the URL, not computed) and a non-empty `Signature` (STO-8) |

### 3.3 `database/runtime.test.ts`

Extend the mocked `Firestore` with `collection(name)` returning `{ add, get, doc }`, where `doc(id)`
returns `{ get, update, delete }`. Add:

| Title | Asserts (statement) |
| :-- | :-- |
| `addresses the collection by its name, unchanged` | every method calls `collection('pages')` for a reference named `pages` (DB-3) |
| `creates with a generated id and returns the input data` | `add(data)` resolving `{ id: 'g1' }` → `{ reference: { collection: ref, id: 'g1' }, data }`, the same object (DB-4) |
| `reads a whole collection as snapshots` | `get()` resolving two documents → two `{ reference, data }` snapshots in that order (DB-5) |
| `reads a document, or undefined when it does not exist` | `exists: true` → a snapshot; `exists: false` → `undefined` (DB-6) |
| `updates with update and deletes with delete` | `update(data)` is called and `{ reference: ref, data }` returned; `delete()` is called. A rejection from `update` propagates (DB-7) |

### 3.4 `secrets/runtime.test.ts`

Add:

| Title | Asserts (statement) |
| :-- | :-- |
| `decodes the payload as UTF-8, and reads a missing payload as undefined` | `payload.data` as `Buffer.from('é')`, as `Uint8Array`, and as the string `'s'` return `'é'`, `'é'` and `'s'`. `payload` absent → `undefined` (SEC-3) |
| `overwrites an existing secret without creating it` | `getSecret` (metadata) resolves → `createSecret` not called; `addSecretVersion` called with `{ parent: 'projects/p/secrets/KEY', payload: { data: Buffer.from('v', 'utf-8') } }` (SEC-5) |
| `tolerates a concurrent creator when overwriting` | `getSecret` rejects `NOT_FOUND`, `createSecret` rejects `ALREADY_EXISTS` → still adds the version and resolves `true` (SEC-5) |
| `claims without cleaning up` | a successful `setSecretIfAbsent` never calls `listSecretVersions` (SEC-10) |
| `deletes a secret, reporting whether it existed` | `deleteSecret` resolves → `true`; rejects `NOT_FOUND` → `false`; rejects code 7 → propagates (SEC-11) |

### 3.5 `deployment/procedure.test.ts`

| Title | Asserts (statement) |
| :-- | :-- |
| `uses the target's credentials for the Functions client, and ADC without them` | with `credentials: { client_email: 'op' }` the mocked `FunctionServiceClient` constructor receives `{ credentials: { client_email: 'op' } }`; without, it receives `{}` (DEP-13) |

## 4. Non-goals

- No production code change in any file.
- No change to the opt-in conformance suite.
- No tests for COM-1, which is a type.
- No test of partial failure in STO-11 and STO-12 (GF10).

## 5. Steps

1. Baseline: the adapter's test count after RFC-0023 (41 passing, 1 skipped), or 38 and 1 without it.
2. §3.1 to §3.5, one file at a time, running the file's tests after each.
3. Run §6.
4. In the architecture documents, replace "unverified" in the Test column of each statement listed in the header with the new test titles. That is a separate docs commit: `docs: cite the GCP runtime tests in the specification`.

## 6. Verification

From the repository root:

```bash
pnpm --filter @genoacms/adapter-gcp test 2>&1 | grep -E "Tests|Test Files"
git diff --stat -- packages/adapter-gcp | grep -v "test.ts" | grep -v "files changed" || echo "tests only"
```

**Expected:** the baseline plus 23 tests, all passing, 1 skipped; `tests only`.

## 7. Critique

**Pros.**
- Every current runtime statement becomes checked on each commit, without credentials.
- The URL tests use the real library, so STO-5 and STO-8 are verified against the actual encoding and signing, not against a mock's echo.

**Cons & trade-offs.**
- Mocked tests pin the SDK call shapes: an SDK upgrade can break them without a behavior change.

**Blindspots.**
- The real-library URL tests depend on the library signing V2 URLs locally when it has a key. A library change to remote signing would make them need the network, and they would fail in CI.
