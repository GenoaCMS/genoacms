# RFC-0008: Port `@genoacms/adapter-minio`

| | |
| :-- | :-- |
| Status | Implemented (`d4bd4b0`) |
| Depends on | RFC-0001, RFC-0002 |
| Architecture | §4 D2; F5 |
| Commit | `feat(adapter-minio): add descriptor and runtime factory` |

## 1. Summary

Add a descriptor and a runtime factory next to `src/index.js`. The provider's nested `config` object
is flattened into top-level options, and the two keys become `Secret` fields. Bucket registration
reads `ctx.resources` instead of the global config.

## 2. Files

**Create** (under `packages/adapter-minio/`):

| File | Purpose |
| :-- | :-- |
| `src/descriptor.js`, `src/descriptor.d.ts` | §4.1 |
| `src/runtime.js`, `src/runtime.d.ts` | §4.2 |
| `src/descriptor.test.js`, `src/runtime.test.js` | §5.1 |
| `test/conformance.test.js` | §5.2 |

**Modify** `package.json`:
- add the dependency `"@genoacms/contracts": "workspace:^"`;
- add the dev dependency `"@genoacms/conformance": "workspace:^"`;
- replace the `test` script with `"test": "vitest run src"` and add `"test:conformance": "vitest run test"`.

`exports` are unchanged.

**Delete:** `genoa.config/index.js`, the fixture of the removed test script. Do **not** read or
delete `genoa.config/credentials.json` if it exists locally; it is gitignored and the author's.

## 3. Non-goals

- Do not modify `src/index.js`.
- Do not add `getPublicURL`. Today's module never implemented it, so the storage contract is not fully met; that gap is carried over, not fixed here.
- **Carry the unawaited `checkBucket(bucket)` calls verbatim.** Today `getObject`, `getSignedURL` and the other methods call it without `await`, so an unregistered bucket becomes an unhandled rejection rather than a thrown error. Fixing that changes behavior and is a separate task (§8).

## 4. Specification

### 4.1 Descriptor

```ts
// src/descriptor.d.ts
import type { AdapterDescriptor, Secret } from '@genoacms/contracts'

export interface MinioStorageOptions {
  endPoint: string
  port?: number
  useSSL?: boolean
  region?: string
  accessKey: Secret
  secretKey: Secret
}
declare module '@genoacms/contracts' {
  interface StorageAdapters { '@genoacms/adapter-minio': MinioStorageOptions }
}
declare const descriptor: AdapterDescriptor<'storage', MinioStorageOptions>
export default descriptor
```

`src/descriptor.js` calls `defineStorageAdapter` with:
- `runtime: '@genoacms/adapter-minio/runtime'`;
- `secretOptions: { accessKey: 'string', secretKey: 'string' }`;
- a `validate` that returns reasons for:
  - any key outside `endPoint`, `port`, `useSSL`, `region`, `accessKey`, `secretKey`;
  - `endPoint` not being a non-empty string;
  - `port` present but not an integer between 1 and 65535;
  - `useSSL` present but not a boolean;
  - a missing `accessKey` or `secretKey`.

### 4.2 Runtime

```js
// src/runtime.js
import * as Minio from 'minio'
import { join } from 'node:path'
import { defineRuntime } from '@genoacms/contracts'

const DIRECTORY_PLACEHOLDER = '.directoryPlaceholder'

export default defineRuntime({
  create ({ endPoint, port, useSSL, region, accessKey, secretKey }, ctx) {
    const client = new Minio.Client(withoutUndefined({ endPoint, port, useSSL, region, accessKey, secretKey }))
    const registered = new Set(ctx.resources)
    // isBucketRegistered and checkBucket as in src/index.js, reading `registered` instead of config.storage.buckets
    // the method bodies of src/index.js, verbatim (including the unawaited checkBucket calls; §3)
    // exactly the nine functions src/index.js exports today; it has never implemented getPublicURL
    return { getObject, getSignedURL, uploadObject, moveObject, deleteObject, listDirectory, createDirectory, deleteDirectory, moveDirectory }
  }
})
```

`withoutUndefined` drops keys whose value is `undefined`, so the Minio client's defaults apply.
`src/runtime.d.ts` declares `AdapterRuntime<MinioStorageOptions, StorageAdapter>` as the default
export.

## 5. Tests

### 5.1 Unit tests (`minio` mocked)

- **Descriptor:** `kind`, `runtime`, `secretOptions`, and `validate` for a valid object plus each rejection listed in §4.1.
- **Runtime:**
  - `create` passes only defined keys to `Minio.Client`;
  - two `create` calls give two clients;
  - `createDirectory` on a registered bucket calls `putObject` with the placeholder name, exactly as today;
  - `listDirectory` output is unchanged for a mocked listing.

### 5.2 `test/conformance.test.js` (opt-in)

Skip unless `GENOACMS_TEST_MINIO === '1'`. It reads `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`,
`MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` and `GENOACMS_TEST_MINIO_BUCKET` from the environment, builds
the runtime with `resources: [bucket]` and calls `runStorageConformance`.

## 6. Steps

1. Update `package.json`, delete the fixture, and run `pnpm install`.
2. Create the descriptor and runtime, then the tests.
3. Run §7.

## 7. Verification

```bash
pnpm install
pnpm --filter @genoacms/adapter-minio run test
pnpm --filter @genoacms/adapter-minio run test:conformance
git status --short
```

**Expected:**
- Unit tests pass, and the conformance run reports *skipped*.
- `git status` lists only files under `packages/adapter-minio/` and `pnpm-lock.yaml`.

## 8. Critique

**Pros.** Two MinIO endpoints in one instance work. Keys can come from the secret store.

**Cons.** `withoutUndefined` is a small helper duplicated in two adapters (MinIO, Postgres). A shared
utility package for two call sites is not worth it.

**Blindspots.** The unawaited `checkBucket` remains a latent unhandled-rejection path. It should be
fixed in its own change, together with a conformance case that proves an unregistered bucket is
refused.
