# RFC-0013: Port `@genoacms/adapter-aws`

| | |
| :-- | :-- |
| Status | Implemented (`03aaf71`) |
| Depends on | RFC-0001, RFC-0002 |
| Architecture | §4 D2, D6; §7.2 (AWS row); F14; §10 rows A10, P9 |
| Commit | `feat(adapter-aws): port storage, database and deployment to descriptors and factories` |

## 1. Summary

`adapter-aws` is non-functional today (F14): it reads `config.storage.region`,
`config.deployment.credentials.accountId` and other fields that no current config shape has. This RFC
ports it to the new contract, so it works again:

- **Storage (S3) and database (DynamoDB):** descriptors plus runtime factories. The method bodies are today's.
- **Deployment:** a descriptor with a procedure.
  - The procedure stages the build artifact with the existing Lambda wrapper (`deployment/assets/index.js`), installs runtime dependencies into the staging directory (Lambda does not install them), zips, uploads to a configured bucket, then creates or updates Lambda and API Gateway with today's logic.
  - The upload bucket is a target option, `artifactBucket`, instead of `config.storage.defaultBucket`.

`exports` are unchanged. RFC-0014 flips them and deletes `src/services/**` and `src/config.d.ts`.

## 2. Files

**Create** (under `packages/adapter-aws/`):

| File | Purpose |
| :-- | :-- |
| `src/shared.js`, `src/shared.d.ts` | `AwsCredentials`, `unknownOptions`, `requireString`, `clientConfig(region, credentials)`; §4.1 |
| `src/storage/descriptor.js`, `.d.ts`; `src/storage/runtime.js` | §4.2 |
| `src/database/descriptor.js`, `.d.ts`; `src/database/runtime.js` | §4.3 |
| `src/deployment/descriptor.js`, `.d.ts`; `src/deployment/procedure.js`; `src/deployment/stage.js`; `src/deployment/lambda.js`; `src/deployment/apiGateway.js`; `src/deployment/upload.js` | §4.4 |
| `src/**/*.test.js`, `test/conformance.test.js` | §5 |

**Modify** `package.json`:
- dependencies: add `"@genoacms/contracts": "workspace:^"` and `"@sveltejs/adapter-node": "^5.2.12"` (the descriptor loads it from this package);
- dev dependencies: add `"@genoacms/conformance": "workspace:^"`, and change `vitest` to `^3.2.7`;
- scripts: replace `test:all`, `test:database` and `test:storage` with `"test": "vitest run src"` and `"test:conformance": "vitest run test"`.

`exports` are unchanged.

**Delete:** `genoa.config/index.js`, the fixture of the removed scripts.

## 3. Non-goals

- No behavior change in S3 or DynamoDB operations. Bodies move verbatim, including `console.error` in `getObject`.
- No change to Lambda runtime (`nodejs20.x`), handler (`index.handler`), API Gateway resource and method setup, or the artifact key `.genoacms/deployment/build.zip`.
- `deployment/assets/index.js` is unchanged. `deployment/assets/package.json` is read for its dependencies, and its own `npm i` step is removed (§4.4).
- No authentication service. `adapter-aws` never shipped one, although the old fixture named one.

## 4. Specification

### 4.1 `src/shared.js`

```ts
// src/shared.d.ts
export interface AwsCredentials { accessKeyId: string, secretAccessKey: string, sessionToken?: string }
export function unknownOptions (options: unknown, allowed: readonly string[]): string[]
export function requireString (options: unknown, key: string): string[]
/** `{ region }`, plus `credentials` when given; omitted means the SDK's default provider chain. */
export function clientConfig (region: string, credentials?: AwsCredentials): { region: string, credentials?: AwsCredentials }
```

### 4.2 Storage (S3)

- **Options:** `{ region: string, credentials?: Secret<AwsCredentials> }`. `secretOptions: { credentials: 'json' }`.
- **Registry key** `'@genoacms/adapter-aws/storage'`, **runtime** `'@genoacms/adapter-aws/storage/runtime'`.
- **`validate`:** unknown keys; `region` required.

Runtime `create({ region, credentials }, ctx)`:
- `const client = new S3Client(clientConfig(region, credentials))`.
- `const registered = new Set(ctx.resources)`.
- `bucketToCommandInput(bucket)`: throws `bucket-unregistered` unless `registered.has(bucket)`.
- `getPublicURL` uses the `region` parameter.
- Every other function and method comes verbatim from `src/services/storage/index.js`, as closures, including `uploadObjectConditionally` and `isPreconditionFailure`.
- `PreconditionFailedError` is imported from `@genoacms/contracts/storage`.

### 4.3 Database (DynamoDB)

- **Options:** `{ region: string, credentials?: Secret<AwsCredentials> }`.
- **Registry key** `'@genoacms/adapter-aws/database'`, **runtime** `'@genoacms/adapter-aws/database/runtime'`, `secretOptions: { credentials: 'json' }`.

The runtime creates `new DynamoDBClient(clientConfig(region, credentials))`. The conversion helpers
and the five methods come verbatim from `src/services/database/index.js`.

### 4.4 Deployment

```ts
// src/deployment/descriptor.d.ts
export interface AwsDeploymentOptions {
  region: string
  /** IAM role ARN the Lambda function runs as. */
  role: string
  /** Account id, used in the API Gateway invoke permission. */
  accountId: string
  /** S3 bucket the deployment archive is uploaded to. */
  artifactBucket: string
  /** Default 'genoacms'. */
  functionName?: string
  credentials?: Secret<AwsCredentials>
}
declare module '@genoacms/contracts' {
  interface DeploymentTargets { '@genoacms/adapter-aws/deployment': AwsDeploymentOptions }
}
```

The descriptor has:
- `svelteKitAdapter: async () => await import('@sveltejs/adapter-node')`;
- `svelteKitOptions: (_o, { outDir }) => ({ out: outDir })`;
- `procedure: async () => await import('./procedure.js')`;
- `secretOptions: { credentials: 'json' }`;
- a `validate` that checks unknown keys and requires `region`, `role`, `accountId` and `artifactBucket`.

`src/deployment/procedure.js`:

```js
export default defineDeployProcedure(async (options, ctx) => {
  const app = await stageLambdaApp(ctx.buildDir, join(ctx.workDir, 'app'), installProductionDependencies)
  const archive = await zipDirectory(app, join(ctx.workDir, 'build.zip'))
  const clients = createClients(options)                      // S3, Lambda, API Gateway, each via clientConfig
  const key = await uploadArchive(clients.s3, options.artifactBucket, archive)
  await createOrUpdateLambda(clients, { ...options, functionName: options.functionName ?? 'genoacms' }, key)
})
```

`src/deployment/stage.js`:

`stageLambdaApp(buildDir, app, install)`:
1. `cp(buildDir, app, { recursive: true })`.
2. `rm(join(app, 'index.js'))`. adapter-node's server entry is replaced by the Lambda wrapper, as today's `ignorePaths: ['index.js']` did.
3. Copy `<package>/deployment/assets/index.js` to `app/index.js`. Resolve the package root from `import.meta.url` of `stage.js` (`../../deployment/assets/`).
4. Read `app/package.json`. If it is missing, throw `deploy/no-runtime-package`, as in RFC-0007. Merge in `dependencies` from `deployment/assets/package.json` (today only `aws-serverless-express`), set `main: 'index.js'`, and write it back.
5. `await install(app)`.

It returns `app`.

`installProductionDependencies(dir)`:
`execFile('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: dir })`.
It uses no shell, which replaces the old `exec(\`cd ${path} && npm i\`)`.

`zipDirectory(dir, out)`: archiver `zip`, `directory(dir, false)`, the same as RFC-0007.

`src/deployment/upload.js`, `lambda.js` and `apiGateway.js` hold today's functions from
`src/services/deployment/{s3,lambda,apiGateway}.js`. Each takes its clients and options as
parameters instead of reading module-level `config`:
- `config.deployment.role` → `options.role`;
- `config.deployment.region` → `options.region`;
- `config.deployment.credentials.accountId` → `options.accountId`;
- `config.storage.defaultBucket` → `options.artifactBucket`.

`uploadArchive` returns the key `.genoacms/deployment/build.zip`.

## 5. Tests

1. **Descriptors:** kind, runtime, `secretOptions`, validation (unknown key; each required key missing). The deployment descriptor's `svelteKitAdapter()` resolves `@sveltejs/adapter-node`.
2. **Storage runtime** (`@aws-sdk/client-s3` mocked):
   - `clientConfig` omits `credentials` when absent;
   - an unregistered bucket throws `bucket-unregistered`;
   - `getPublicURL({ bucket: 'b', name: 'n' })` for region `eu-central-1` equals `https://b.s3.eu-central-1.amazonaws.com/n`;
   - two instances with different regions are independent.
3. **Database runtime** (`@aws-sdk/client-dynamodb` mocked): conversion round-trip of a nested document through the verbatim helpers.
4. **`stageLambdaApp`** (temp dirs, `install` a spy):
   - produces an `app/` whose `index.js` equals the wrapper and whose `package.json` has `main: 'index.js'`, the artifact's dependencies, and `aws-serverless-express`;
   - `install` is called once with `app`;
   - a missing `package.json` throws `deploy/no-runtime-package`.
5. **Procedure** (all three SDK clients mocked, `install` spied via `vi.mock('./stage.js', …)` partial):
   - the upload goes to `artifactBucket` with the fixed key;
   - `GetFunctionCommand` rejecting leads to create plus API Gateway setup, and resolving leads to update only;
   - `functionName` defaults to `genoacms`.
6. **`test/conformance.test.js` (opt-in):**
   - skipped unless `GENOACMS_TEST_AWS === '1'`;
   - credentials come from the SDK default chain (the operator's environment);
   - region and bucket from `GENOACMS_TEST_AWS_REGION` and `GENOACMS_TEST_AWS_BUCKET`, table fixture from `GENOACMS_TEST_AWS_TABLE`;
   - runs both suites.

## 6. Steps

1. Update `package.json`, delete the fixture, and run `pnpm install`.
2. Create shared, storage, database, then deployment.
3. Write the tests, then run §7.

## 7. Verification

```bash
pnpm install
pnpm --filter @genoacms/adapter-aws run test
pnpm --filter @genoacms/adapter-aws run test:conformance
grep -ln "@aws-sdk\|archiver" packages/adapter-aws/src/*/descriptor.js || echo "descriptors SDK-free: ok"
git status --short
```

**Expected:**
- Unit tests pass, and the conformance run reports *skipped*.
- The grep prints `descriptors SDK-free: ok`.
- `git status` lists only files under `packages/adapter-aws/` and `pnpm-lock.yaml`.

## 8. Critique

**Pros.**
- AWS goes from non-functional to a working port with testable deploy steps.
- Deployment is decoupled from the storage config (`artifactBucket`).
- The shell `cd && npm i` becomes `execFile`.

**Cons & trade-offs.**
- Lambda needs `node_modules` in the zip, so this is the one target that installs locally. The zip is larger, and the install needs network access on the operator's machine.
- Native modules installed on the operator's machine may not match Lambda's Linux environment.

**Blindspots.**
- The API Gateway setup is copied verbatim and has never been exercised against the current codebase, because it could not run (F14). Correctness beyond the unit tests is unproven until someone runs an opt-in live deploy.
- `@sveltejs/adapter-node` output under Lambda through `aws-serverless-express` is carried over from the old design, unverified.
