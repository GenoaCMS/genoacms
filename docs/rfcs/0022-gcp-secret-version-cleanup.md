# RFC-0022: Destroy superseded Secret Manager versions

| | |
| :-- | :-- |
| Status | Draft |
| Depends on | RFC-0007 |
| Architecture | [`adapter-gcp/secrets.md`](../architecture/adapter-gcp/secrets.md) GD4; GF5; README §4, GU3 |
| Commit | `feat(adapter-gcp): destroy superseded secret versions after a recovery window` |

## 1. Summary

`setSecret` adds a version and leaves every older one enabled, readable and billed (GF5). This RFC:
- gives every secret the adapter creates a 7-day `versionDestroyTtl`, so a destroyed version stays recoverable for a week;
- makes `setSecret` destroy, best effort, every enabled version older than the one it just added.

## 2. Files

**Modify only:**

| File | Change |
| :-- | :-- |
| `packages/adapter-gcp/src/secrets/runtime.ts` | §3 |
| `packages/adapter-gcp/src/secrets/runtime.test.ts` | §5 |

## 3. Specification

Inside `create`, next to the existing helpers:

```ts
/** A destroyed version stays disabled this long before Secret Manager destroys it (architecture GD4). */
const VERSION_DESTROY_TTL = { seconds: 7 * 24 * 60 * 60 }

/** The secret resource every create path uses. */
const newSecret = () => ({ replication: { automatic: {} }, versionDestroyTtl: VERSION_DESTROY_TTL })

/** The number at the end of a version resource name. */
function versionNumber (name: string): number   // throws Error(`secrets/unexpected-version-name: ${name}`) unless the last path segment is a positive integer

/** Destroys every enabled version of `key` numbered below `added`. */
async function destroySuperseded (key: string, added: string): Promise<void>

/** destroySuperseded, reporting instead of failing: the new value is already written. */
async function cleanUp (key: string, added: string): Promise<void>
```

- Both `createSecret` calls, in `ensureSecretExists` and in `setSecretIfAbsent`, pass `secret: newSecret()`.
- `destroySuperseded` does `const [versions] = await client.listSecretVersions({ parent: secretName(key), filter: 'state:ENABLED' })`. It then calls `destroySecretVersion({ name })` sequentially, in list order, for each version whose `versionNumber(name) < versionNumber(added)`.
- `cleanUp` awaits `destroySuperseded`. On any error it calls `console.warn(`secrets/cleanup-failed: ${key}: ${message}`)` and resolves.
- `setSecret` keeps the version it adds, `const [version] = await client.addSecretVersion(...)`, then `await cleanUp(key, version.name)` when `version.name` is a string, and returns `true`.
- Extend the doc comment at the top of the file: replace the paragraph starting "The practical consequence" with two sentences: "`setSecret` therefore destroys the versions it supersedes (architecture GD4). Secrets created here keep a destroyed version disabled for seven days before it is gone, so a bad overwrite can be undone by hand."

`getSecret`, `setSecretIfAbsent`'s claim semantics and `deleteSecret` are unchanged.

## 4. Non-goals

- No change to secrets that already exist: their TTL is not set by GenoaCMS (§6, operator step).
- No option for the TTL.
- No cleanup in `setSecretIfAbsent`, which never supersedes.
- No change to core or to the contract.

## 5. Tests

Extend the mocked client with `listSecretVersions` and `destroySecretVersion`. Default
`addSecretVersion` to resolve `[{ name: 'projects/p/secrets/KEY/versions/3' }]`. Existing cases are
unchanged. Add:

1. `setSecret` on a missing secret creates it with `secret: { replication: { automatic: {} }, versionDestroyTtl: { seconds: 604800 } }`, and a claim through `setSecretIfAbsent` uses the same secret resource.
2. With enabled versions `1`, `2`, `3` and `4` listed (`4` being a concurrent writer's), `setSecret` destroys exactly `…/versions/1` and `…/versions/2`, in that order. It lists with `filter: 'state:ENABLED'`.
3. When `listSecretVersions` rejects, `setSecret` still resolves `true`, and `console.warn` is called once with a message starting `secrets/cleanup-failed: KEY:`.
4. When a version name does not end in a number, `setSecret` resolves `true`, warns, and destroys nothing.

## 6. Operator step for existing instances

Secrets created before this RFC have no TTL, so the versions it destroys there are destroyed
immediately. Before deploying it to an existing instance, the operator sets the TTL on the two
secrets GenoaCMS overwrites:

```bash
gcloud secrets update GENOACMS_ROOT_KEY_SEED --project <projectId> --version-destroy-ttl=604800s
```

```bash
gcloud secrets update GENOACMS_KEY_REGISTRY_SEQUENCE --project <projectId> --version-destroy-ttl=604800s
```

The runtime identity also needs `secretmanager.versions.list` and `secretmanager.versions.destroy`
(architecture README §4). Without them, every overwrite warns and nothing is destroyed. That is the
behavior before this RFC, plus a warning.

## 7. Steps

1. Baseline: the adapter's test count after RFC-0021, if implemented; otherwise 22 passed and 1 skipped.
2. §3 with §5.
3. Run §8.

## 8. Verification

From the repository root:

```bash
pnpm --filter @genoacms/adapter-gcp test 2>&1 | grep -E "Tests|Test Files"
pnpm --filter @genoacms/adapter-gcp run build 2>&1 | tail -2
```

**Expected:** all tests pass, the baseline plus four; the build compiles.

**GS4, live (author, scratch project, opt-in).** Three `setSecret` calls on one new key leave one
enabled version and two disabled versions with a scheduled destroy time, and `getSecret` returns the
third value (architecture `adapter-gcp/secrets.md` §5).

## 9. Critique

**Pros.**
- The change is local to `setSecret`, and the write it follows is unchanged, so a failed cleanup never loses a value.
- Concurrent writers cannot destroy each other's newer versions, because each destroys only below its own number.

**Cons & trade-offs.**
- Each overwrite costs one list call, plus one call per destroyed version: after the first cleanup, one.
- The recovery window depends on an operator step for secrets that already exist.

**Blindspots.**
- `console.warn` is the only signal of a missing permission. An instance can run for months with cleanup failing unnoticed, back to GF5's behavior.
- `listSecretVersions` pages automatically. A secret with thousands of accumulated versions is cleaned in one slow first overwrite.
