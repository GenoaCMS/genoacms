# RFC-0007: Port `@genoacms/adapter-gcp`

| | |
| :-- | :-- |
| Status | Draft |
| Depends on | RFC-0001, RFC-0002 |
| Architecture | §4 D2, D6; §5.4 (example); §7.2 (GCP row); F9, F15, F17; U2, U10 |
| Commit | `feat(adapter-gcp): add descriptors, runtime factories and a build-artifact deploy procedure` |

## 1. Summary

Add four descriptor + runtime pairs next to the existing `src/services/*` modules:
- storage;
- database (Firestore);
- secrets (Secret Manager);
- deployment (a descriptor plus a procedure).

The runtime method bodies are today's, moved into closures. The deploy procedure changes model per
U2. It archives the **build artifact** (with its generated `package.json`) and a generated
`function.js`. It no longer archives the project source, so the config directory and credentials
never leave the machine (fixes F9 and F15).

`exports` are not changed here. RFC-0014 flips them and deletes `src/services/`, `src/config.ts`,
`src/genoa.config.d.ts` and `deployment/`.

## 2. Files

**Create** (under `packages/adapter-gcp/`):

| File | Purpose |
| :-- | :-- |
| `src/shared/serviceAccount.ts` | `ServiceAccount` type, `unknownOptions()` helper; §4.1 |
| `src/storage/descriptor.ts`, `src/storage/runtime.ts` | §4.2 |
| `src/database/descriptor.ts`, `src/database/runtime.ts` | §4.3 |
| `src/secrets/descriptor.ts`, `src/secrets/runtime.ts` | §4.4 |
| `src/deployment/descriptor.ts`, `src/deployment/procedure.ts`, `src/deployment/archive.ts`, `src/deployment/functions.ts` | §4.5 |
| `src/**/*.test.ts` | §5 |
| `test/conformance.test.ts` | §5.3 |
| `vitest.config.ts` | `export default defineConfig({ test: { include: ['src/**/*.test.ts', 'test/**/*.test.ts'] } })` |

**Modify** `package.json`:
- `dependencies`: add `"@genoacms/contracts": "workspace:^"`. Move `@genoacms/sveltekit-adapter-cloud-run-functions` from `peerDependencies` to `dependencies`, because the descriptor loads it from this package (S-5).
- `devDependencies`: add `"@genoacms/conformance": "workspace:^"`.
- `scripts`: replace `test:all`, `test:database` and `test:storage` with `"test": "vitest run"` and `"test:conformance": "vitest run test/conformance.test.ts"`.
- `exports`: **unchanged**.

**Modify** `tsconfig.json`: add `"include": ["src/**/*.ts"]` and `"exclude": ["src/**/*.test.ts"]`, so
tests and the old fixture are not compiled into `dist`.

**Delete:** `genoa.config.js`. It is the test fixture of the removed scripts, and it uses the long-dead
singular shape.

## 3. Non-goals

- Do not change any method's behavior. Bodies move verbatim, except for the client and bucket lookups named below.
- Do not change the Cloud Run function parameters (runtime `nodejs20`, entry point `genoacms`, instance counts, ingress, `NODE_ENV`).
- Do not run a real deploy. U10 defers it to RFC-0014's optional verification.
- Do not touch `src/services/**`, `src/config.ts`, `src/genoa.config.d.ts` or `deployment/snippets/**`.

## 4. Specification

### 4.1 `src/shared/serviceAccount.ts`

```ts
/** The fields of a Google service-account key file that the client libraries read. */
export interface ServiceAccount {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri?: string
  token_uri?: string
  auth_provider_x509_cert_url?: string
  client_x509_cert_url?: string
  universe_domain?: string
}

/** Reasons for option keys outside `allowed`. Every descriptor rejects unknown keys so typos fail the build. */
export function unknownOptions (options: unknown, allowed: readonly string[]): string[]

/** Reason when `options[key]` is not a non-empty string, else []. */
export function requireString (options: unknown, key: string): string[]
```

`credentials` is optional everywhere. Omitted means Application Default Credentials (architecture §6.3).

### 4.2 Storage

`src/storage/descriptor.ts`:

```ts
import { defineStorageAdapter, type Secret } from '@genoacms/contracts'
import { unknownOptions, requireString, type ServiceAccount } from '../shared/serviceAccount.js'

export interface GcpStorageOptions {
  projectId: string
  credentials?: Secret<ServiceAccount>
}
declare module '@genoacms/contracts' {
  interface StorageAdapters { '@genoacms/adapter-gcp/storage': GcpStorageOptions }
}
export default defineStorageAdapter<GcpStorageOptions>({
  runtime: '@genoacms/adapter-gcp/storage/runtime',
  secretOptions: { credentials: 'json' },
  validate: options => [...unknownOptions(options, ['projectId', 'credentials']), ...requireString(options, 'projectId')]
})
```

`src/storage/runtime.ts`: `export default defineRuntime<GcpStorageOptions, StorageAdapter>({ create })`.
Inside `create({ projectId, credentials }, ctx)`:
- `const storage = new Storage(credentials === undefined ? { projectId } : { projectId, credentials })`;
- `const registered = new Set(ctx.resources)`;
- `getBucket(name)`: if `!registered.has(name)`, throw `new Error('bucket-unregistered')` (today's message); else `storage.bucket(name)`;
- return an object with the ten methods, whose bodies are copied from `src/services/storage/index.ts` with their doc comments. Only `getBucket` changes, now closing over `registered`.

`PreconditionFailedError` comes from `@genoacms/contracts/storage`.

### 4.3 Database (Firestore)

```ts
export interface GcpDatabaseOptions {
  projectId: string
  /** Default '(default)'. */
  databaseId?: string
  credentials?: Secret<ServiceAccount>
}
```

- Registry key: `'@genoacms/adapter-gcp/database'`.
- Runtime: `'@genoacms/adapter-gcp/database/runtime'`.
- `secretOptions`: `{ credentials: 'json' }`.
- Allowed keys: `projectId`, `databaseId`, `credentials`. `projectId` is required.

The runtime creates `new Firestore({ projectId, databaseId: databaseId ?? '(default)', ...(credentials === undefined ? {} : { credentials }) })`.
The five method bodies are copied from `src/services/database/index.ts`.

`region` is **not** an option. The Firestore client never read it, and the unknown-key check now
rejects it. Core's config drops it in RFC-0014.

### 4.4 Secrets (Secret Manager)

```ts
export interface GcpSecretsOptions {
  projectId: string
  /** Bootstrap: env() or inline() only. Omit for Application Default Credentials (recommended). */
  credentials?: BootstrapSecret<ServiceAccount>
}
```

- Registry key `'@genoacms/adapter-gcp/secrets'`, runtime `'@genoacms/adapter-gcp/secrets/runtime'`, `secretOptions: { credentials: 'json' }`.
- The descriptor uses `defineSecretsAdapter`, so a `Secret<…>` field would not compile.

The runtime builds `new SecretManagerServiceClient({ projectId, ...(credentials === undefined ? {} : { credentials }) })`.
Copy from `src/services/secrets/index.ts`, verbatim and with doc comments:
- the file-level doc comment;
- `NOT_FOUND`, `ALREADY_EXISTS`, `hasStatusCode`, `ensureSecretExists`;
- the four methods.

`parent`, `secretName` and `latestVersionName` become closures over `projectId`.

### 4.5 Deployment

`src/deployment/descriptor.ts`:

```ts
import { defineDeploymentTarget, type Secret } from '@genoacms/contracts'
import { unknownOptions, requireString, type ServiceAccount } from '../shared/serviceAccount.js'

export interface GcpDeploymentOptions {
  projectId: string
  region: string
  /** Default 'genoacms'. */
  functionName?: string
  /** Used by `genoa deploy` on the operator's machine only. Never embedded in the build. */
  credentials?: Secret<ServiceAccount>
}
declare module '@genoacms/contracts' {
  interface DeploymentTargets { '@genoacms/adapter-gcp/deployment': GcpDeploymentOptions }
}
export default defineDeploymentTarget<GcpDeploymentOptions>({
  svelteKitAdapter: async () => await import('@genoacms/sveltekit-adapter-cloud-run-functions'),
  svelteKitOptions: (_options, { outDir }) => ({ out: outDir }),
  procedure: async () => await import('./procedure.js'),
  secretOptions: { credentials: 'json' },
  validate: options => [
    ...unknownOptions(options, ['projectId', 'region', 'functionName', 'credentials']),
    ...requireString(options, 'projectId'),
    ...requireString(options, 'region')
  ]
})
```

The descriptor must import **nothing** except `@genoacms/contracts` and `../shared/serviceAccount.js`.
Both loaders are `import()` expressions inside functions.

`src/deployment/procedure.ts`:

```ts
export default defineDeployProcedure<GcpDeploymentOptions>(async (options, ctx) => {
  const app = await stageArtifact(ctx.buildDir, join(ctx.workDir, 'app'))
  const archive = await zipDirectory(app, join(ctx.workDir, 'build.zip'))
  const client = createFunctionsClient(options.credentials)
  const storageSource = await uploadArchive(client, options.projectId, options.region, archive)
  await deployFunction(client, { ...options, functionName: options.functionName ?? 'genoacms' }, storageSource)
})
```

`src/deployment/archive.ts`:
- `stageArtifact(buildDir, app)`:
  1. `cp(buildDir, app, { recursive: true })`.
  2. Read `app/package.json`. If it is missing, throw `Error('deploy/no-runtime-package: <buildDir>/package.json is missing; build with genoa build')`.
  3. Set `main: 'function.js'` and write it back.
  4. Write `app/function.js` exactly as:

     ```js
     import { handler } from './index.js'

     /** Cloud Run functions entry point. The name must match buildConfig.entryPoint. */
     export function genoacms (req, res) {
       handler(req, res, undefined)
     }
     ```

  Returns `app`.
- `zipDirectory(dir, out)`: archiver `zip` with `zlib.level 9` and `archive.directory(dir, false)`. **No** `glob`, **no** `follow`, no ignore list, because the input is exactly the artifact. Returns `out`.

`src/deployment/functions.ts`:
- `createFunctionsClient(credentials?)` builds `new v2.FunctionServiceClient(credentials === undefined ? {} : { credentials })`.
- `uploadArchive(client, projectId, region, archivePath)`: body from `uploadSource` in `src/services/deployment/deploy.ts`, parameterized.
- `deployFunction(client, { projectId, region, functionName }, storageSource)`: body from `deployFunction` in the same file, parameterized. The `operationParams` object is unchanged.

`FUNCTION_ENTRY` imports `./index.js`, which re-exports `handler` in the cloud-run SvelteKit adapter's
output. That was verified locally in S-4 with Google's Functions Framework.

## 5. Tests

### 5.1 Descriptor tests

Four files, `src/<service>/descriptor.test.ts`, check for each descriptor:
- its `kind` and `runtime` (deployment has no runtime);
- `secretOptions`;
- `validate` accepts a minimal valid options object;
- `validate` reports: an unknown key, a missing required key, and `projectId: ''`.

`src/deployment/descriptor.test.ts` also:
- mocks `@genoacms/sveltekit-adapter-cloud-run-functions`, calls `svelteKitAdapter()` and checks that it resolves the mock;
- checks that `svelteKitOptions({…}, { outDir: '/x' })` equals `{ out: '/x' }`.

### 5.2 Runtime and procedure unit tests (SDKs mocked with `vi.mock`)

1. `storage/runtime`: `create` passes `{ projectId }` without credentials and `{ projectId, credentials }` with them. `getObject` on a bucket outside `ctx.resources` rejects `bucket-unregistered`. Two `create` calls give two distinct `Storage` instances (the "two instances of one adapter" property).
2. `database/runtime`: `databaseId` defaults to `'(default)'`.
3. `secrets/runtime`: `getSecret` returns `undefined` on gRPC code 5, and `setSecretIfAbsent` returns `false` on code 6. These are the existing behaviors, now pinned.
4. `deployment/archive`:
   - a temp `buildDir` with `index.js` and `package.json` stages to `app/`, with `main: 'function.js'` and `function.js` equal to the snippet above;
   - a missing `package.json` throws `deploy/no-runtime-package`;
   - `zipDirectory` produces an archive whose entry list (read back with `unzip -Z1` or a zip reader dev dependency) equals the staged files exactly.
5. `deployment/procedure`: with `@google-cloud/functions` and `fetch` mocked:
   - calls `generateUploadUrl`, then a `PUT` of the archive, then `getFunction`, then `createFunction` when `getFunction` rejects (or `updateFunction` when it resolves);
   - `functionName` defaults to `genoacms`;
   - nothing is read from `process.cwd()` (spy that asserts `process.cwd` is not called).

### 5.3 `test/conformance.test.ts` (opt-in)

Skip unless `GENOACMS_TEST_GCP === '1'`. Credentials come only from Application Default Credentials
(`GOOGLE_APPLICATION_CREDENTIALS` in the operator's shell). The test never reads a key file itself.

```ts
const bucket = process.env.GENOACMS_TEST_GCP_BUCKET!
const projectId = process.env.GENOACMS_TEST_GCP_PROJECT!
const storage = await storageRuntime.create({ projectId }, { name: 'conformance', resources: [bucket] })
runStorageConformance(storage, { bucket })
const database = await databaseRuntime.create({ projectId }, { name: 'conformance', resources: ['test'] })
runDatabaseConformance(database, { collection: { name: 'genoacms-conformance', primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object' } }, testDocuments: [{ name: 'createDocument', isA: true }, { name: 'updateDocument', isA: false }] })
```

## 6. Steps

1. Update `package.json` and `tsconfig.json`, delete `genoa.config.js`, run `pnpm install`.
2. Create shared, then each service's descriptor and runtime, then deployment.
3. Write the tests, then run §7.

## 7. Verification

```bash
pnpm install
pnpm --filter @genoacms/adapter-gcp run build
pnpm --filter @genoacms/adapter-gcp run test
node --input-type=module -e "const d = (await import('./packages/adapter-gcp/dist/deployment/descriptor.js')).default; console.log(d.kind, typeof d.svelteKitAdapter, typeof d.procedure)"
grep -rln "google-cloud\|archiver" packages/adapter-gcp/src/*/descriptor.ts || echo "descriptors SDK-free: ok"
git status --short
```

**Expected:**
- Build and tests pass. The conformance test reports *skipped*.
- The `node` line prints `deployment function function`.
- The grep prints `descriptors SDK-free: ok`.
- `git status` lists only files under `packages/adapter-gcp/` and `pnpm-lock.yaml`.

**Optional, by the author only (U10):** a live conformance run with `GENOACMS_TEST_GCP=1` and ADC
configured.

## 8. Critique

**Pros.**
- Two GCP projects in one instance become possible: each provider gets its own client.
- The deploy archive now contains exactly the artifact, with no project source and no credentials. The procedure is testable without GCP.

**Cons & trade-offs.**
- Moving `@genoacms/sveltekit-adapter-cloud-run-functions` into `dependencies` installs it for users who only use GCP storage. It is small.
- The adapter ships twice as many entry points.

**Blindspots.**
- The generated `function.js` assumes the cloud-run SvelteKit adapter's `index.js` keeps exporting `handler`. A change there breaks deploys at runtime, not at build. A test on the adapter's `files/index.js` would catch it, but that package is out of scope.
- The Cloud Functions runtime `nodejs20` is hard-coded, as today, while the monorepo engines allow Node 24.
- Buildpacks install without a lockfile (architecture critique).
