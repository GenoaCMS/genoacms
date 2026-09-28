# RFC-0021: GCP deploy waits for the platform; function settings are options

| | |
| :-- | :-- |
| Status | Draft |
| Depends on | RFC-0007, RFC-0020 |
| Architecture | [`adapter-gcp/deployment.md`](../architecture/adapter-gcp/deployment.md) GD1, GD3; GF1, GF2, GF3, GF6; README GU3 |
| Commit | `feat(adapter-gcp): wait for the deploy and make function settings options` |

## 1. Summary

`genoa deploy gcp` today returns as soon as it has asked for the function. It never learns whether
Cloud Build succeeded (GF1), it ignores a failed upload (GF2), it treats any lookup error as "the
function does not exist" (GF6), and every function setting is hardcoded (GF3). This RFC:

1. checks the upload response;
2. treats only `NOT_FOUND` as absent;
3. awaits the create or update operation, fails with the platform's error, and prints the function's URL;
4. adds seven optional target options for the function's settings, with today's values as defaults, except the runtime, which moves to `nodejs22`.

## 2. Files

All under `packages/adapter-gcp/src/deployment/`. **Modify or create only:**

| File | Change |
| :-- | :-- |
| `settings.ts` | **new**, §3.1. SDK-free. |
| `settings.test.ts` | **new**, §5 |
| `descriptor.ts` | §3.2 |
| `descriptor.test.ts` | §5 |
| `functions.ts` | §3.3 |
| `procedure.ts` | §3.4 |
| `procedure.test.ts` | §5 |

## 3. Specification

### 3.1 `settings.ts` (new)

```ts
type Ingress = 'all' | 'internal' | 'internal-and-gclb'

/** The function's settings, as the gcp target's options name them (architecture GD3). */
interface FunctionSettings {
  runtime?: string
  memory?: string
  timeoutSeconds?: number
  minInstances?: number
  maxInstances?: number
  ingress?: Ingress
  serviceAccount?: string
}

const SETTING_KEYS: readonly string[]   // the seven keys above, in that order
const DEFAULT_RUNTIME = 'nodejs22'

/** Reasons the settings in `options` are invalid, else []. Ignores keys that are not settings. */
function validateSettings (options: unknown): string[]

/** The Cloud Functions v2 buildConfig for an uploaded source. */
function buildConfig (settings: FunctionSettings, storageSource: object): object

/** The Cloud Functions v2 serviceConfig. */
function serviceConfig (settings: FunctionSettings): object

export { SETTING_KEYS, DEFAULT_RUNTIME, validateSettings, buildConfig, serviceConfig }
export type { FunctionSettings, Ingress }
```

`validateSettings` checks only keys that are present. Each rule yields exactly the reason given, and
the reasons appear in `SETTING_KEYS` order:

| Key | Valid when | Reason otherwise |
| :-- | :-- | :-- |
| `runtime` | string matching `/^nodejs\d+$/` | `runtime must be a Node.js runtime such as 'nodejs22'` |
| `memory` | string matching `/^\d+(M\|Mi\|G\|Gi)$/` | `memory must be a size such as '512Mi' or '1Gi'` |
| `timeoutSeconds` | integer, 1 to 3600 | `timeoutSeconds must be an integer from 1 to 3600` |
| `minInstances` | integer ≥ 0 | `minInstances must be an integer of at least 0` |
| `maxInstances` | integer ≥ 1 | `maxInstances must be an integer of at least 1` |
| `ingress` | one of `all`, `internal`, `internal-and-gclb` | `ingress must be 'all', 'internal' or 'internal-and-gclb'` |
| `serviceAccount` | string matching `/^[^@\s]+@[^@\s]+$/` | `serviceAccount must be a service account email` |

It adds one more rule, after those: when both instance counts are valid integers and
`minInstances > maxInstances`, the reason is `minInstances must not exceed maxInstances`.

`buildConfig` returns `{ entryPoint: 'genoacms', runtime: settings.runtime ?? DEFAULT_RUNTIME, source: { storageSource } }`.

`serviceConfig` returns, in this key order:

```ts
{
  minInstanceCount: settings.minInstances ?? 0,
  maxInstanceCount: settings.maxInstances ?? 1,
  ingressSettings: INGRESS[settings.ingress ?? 'all'],   // all: 1, internal: 2, internal-and-gclb: 3
  environmentVariables: { NODE_ENV: 'production' },
  ...(settings.memory === undefined ? {} : { availableMemory: settings.memory }),
  ...(settings.timeoutSeconds === undefined ? {} : { timeoutSeconds: settings.timeoutSeconds }),
  ...(settings.serviceAccount === undefined ? {} : { serviceAccountEmail: settings.serviceAccount })
}
```

The `INGRESS` numbers are Cloud Functions v2's `IngressSettings` enum (`ALLOW_ALL = 1`,
`ALLOW_INTERNAL_ONLY = 2`, `ALLOW_INTERNAL_AND_GCLB = 3`), written as numbers so that the module
imports no SDK.

### 3.2 `descriptor.ts`

- `GcpDeploymentOptions` extends `FunctionSettings`. Its doc comment adds one sentence: "The function's settings; each defaults to today's behavior except `runtime` (architecture GD3)."
- `unknownOptions` allows `['projectId', 'region', 'functionName', 'credentials', ...SETTING_KEYS]`.
- `validate` appends `...validateSettings(options)` after the existing checks.
- The descriptor may now import `./settings.js` as well. It still imports no SDK.

### 3.3 `functions.ts`

- **`uploadArchive`**: keep the result of `fetch`. When `!response.ok`, throw `Error(`deploy/upload-failed: ${response.status} ${response.statusText}`)`.
- **New `functionExists (client, name): Promise<boolean>`**: `true` when `getFunction` resolves; `false` when it rejects with `code === 5` (gRPC `NOT_FOUND`); otherwise rethrow.
- **New `completeOperation (operation): Promise<CloudFunction>`**: `const [result] = await operation.promise()` and return it. When the promise rejects, throw `Error(`deploy/function-failed: ${message}`, { cause })`, where `message` is the error's `message`.
- **`deployFunction (client, target, storageSource, settings: FunctionSettings): Promise<string | undefined>`**:
  1. `functionExists`;
  2. `createFunction` or `updateFunction` with `{ functionId, parent, function: { name, buildConfig: buildConfig(settings, storageSource), serviceConfig: serviceConfig(settings) } }`. No `updateMask`: the whole configuration is written (architecture GD3);
  3. `completeOperation` on the returned operation;
  4. return `result.url ?? result.serviceConfig?.uri`.

  Remove the `console.log(response)`.

### 3.4 `procedure.ts`

Pass the settings to `deployFunction`, as the options object itself, since `FunctionSettings` is a
subset of `GcpDeploymentOptions`. When it returns a URL, `console.info(`Function URL: ${url}`)`.
Nothing else changes.

## 4. Non-goals

- No IAM checks before deploying (architecture GQ2).
- No concurrency, CPU or extra environment variables (architecture GQ1).
- No change to staging, zipping, the entry module or the SvelteKit adapter.
- No retry on a failed operation, and no timeout beyond the client library's defaults for long-running operations.
- No change to GF7 (`getClientAddress`).
- No live deploy by the implementing agent: GS2 is the author's.

## 5. Tests

**`settings.test.ts`:**
1. Empty settings validate to `[]`, and a full valid set (`nodejs24`, `1Gi`, `300`, `0`, `3`, `internal-and-gclb`, `cms@p.iam.gserviceaccount.com`) validates to `[]`.
2. Each invalid value yields exactly its reason from §3.1. One case per key, with `runtime: 'node22'`, `memory: '512MB'`, `timeoutSeconds: 0`, `minInstances: -1`, `maxInstances: 0`, `ingress: 'public'`, `serviceAccount: 'cms'`.
3. `minInstances: 2, maxInstances: 1` yields `minInstances must not exceed maxInstances`.
4. `buildConfig({}, s)` uses `nodejs22`, and `buildConfig({ runtime: 'nodejs24' }, s)` uses `nodejs24`.
5. `serviceConfig({})` equals `{ minInstanceCount: 0, maxInstanceCount: 1, ingressSettings: 1, environmentVariables: { NODE_ENV: 'production' } }`, which are today's values.
6. `serviceConfig` with all seven set maps each one, with ingress `internal` → `2` and `internal-and-gclb` → `3`.

**`descriptor.test.ts`:** add one case: every setting key is accepted, and an invalid `memory` is
reported through `validate`. The existing unknown-key case used `runtime: 'nodejs20'` as its example
of an unknown option, which this RFC makes a real option. It uses `concurrency: 80` instead, a key
that stays unknown (architecture GQ1). The other existing cases are unchanged.

**`procedure.test.ts`**: the mocked `createFunction` and `updateFunction` return
`[{ promise: async () => [{ url: 'https://fn.example' }] }]`, and `getFunction` rejects with
`Object.assign(new Error('not found'), { code: 5 })` when the function is absent. Existing cases keep
their assertions. Add:
1. an upload answered with `new Response(null, { status: 403, statusText: 'Forbidden' })` rejects with `deploy/upload-failed: 403 Forbidden`, and `createFunction` is not called;
2. `getFunction` rejecting with `code: 7` rejects the procedure with that error, and neither create nor update is called;
3. an operation whose `promise()` rejects with `new Error('Build failed: npm ERR! 404')` rejects with `/^deploy\/function-failed: Build failed: npm ERR! 404/`;
4. on success, `console.info` is called with `Function URL: https://fn.example`;
5. `createFunction` receives `buildConfig.runtime: 'nodejs22'` and `serviceConfig.serviceAccountEmail` when the options name `serviceAccount`.

## 6. Steps

1. Baseline: `pnpm --filter @genoacms/adapter-gcp test` has 22 tests passing and 1 skipped.
2. §3.1 with `settings.test.ts`.
3. §3.2 with the descriptor test.
4. §3.3 and §3.4 with the procedure tests.
5. Run §7.

## 7. Verification

From the repository root:

```bash
pnpm --filter @genoacms/adapter-gcp test 2>&1 | grep -E "Tests|Test Files"
pnpm --filter @genoacms/adapter-gcp run build 2>&1 | tail -2
grep -nE "from '@google-cloud|from 'archiver'" packages/adapter-gcp/src/deployment/descriptor.ts packages/adapter-gcp/src/deployment/settings.ts || echo "descriptor and settings are SDK-free"
```

**Expected:** all tests pass, 22 plus the new ones, 1 skipped; the build compiles; `descriptor and
settings are SDK-free`.

The production build of core must still validate its target. Run from `packages/core`:

```bash
node ../cli/src/index.js build gcp --config genoa.config/production.ts 2>&1 | grep -E "config/invalid|Packed into the artifact" | cut -c1-40
```

**Expected:** one line starting `Packed into the artifact`, and no `config/invalid`.

**GS2 (author, live).** Architecture `adapter-gcp/deployment.md` §6: a deploy whose install fails must
exit non-zero with `deploy/function-failed`, and the real deploy must exit zero and print the URL.

## 8. Critique

**Pros.**
- The deploy's exit code becomes trustworthy, and each failure names its stage: upload, lookup or build.
- The mapping from options to the API lives in one pure module, tested without the SDK.
- Defaults reproduce today's function, apart from the runtime.

**Cons & trade-offs.**
- `genoa deploy` now blocks for the Cloud Build duration.
- The descriptor gains seven options, so its validation is larger than the procedure it configures.

**Blindspots.**
- The client library's default polling timeout for long-running operations bounds how long a build may take before the CLI gives up. The operation continues on Google's side, and the CLI reports a failure for a deploy that may still succeed.
- `memory` and `runtime` are validated by shape only. A well-formed but unsupported value, such as `nodejs99` or `3Mi`, is refused by the platform during the operation, which GD1 now reports.
