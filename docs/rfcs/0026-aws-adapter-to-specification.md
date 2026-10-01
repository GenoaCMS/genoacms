---
type: rfc
number: 26
title: Bring the AWS adapter to its Specification
status: draft
commits: []
depends: [25]
architecture: [architecture/adapter-aws/README.md, architecture/adapter-aws/storage.md, architecture/adapter-aws/database.md, architecture/adapter-aws/secrets.md, architecture/adapter-aws/deployment.md]
changes: [OBJ-2 added, OBJ-3 added, OBJ-4 added, OBJ-5 added, OBJ-6 added, OBJ-7 added, OBJ-8 added, OBJ-9 added, OBJ-10 added, OBJ-11 added, DDB-2 added, DDB-3 added, DDB-4 added, DDB-5 added, DDB-6 added, DDB-7 added, ASM-1 added, ASM-2 added, ASM-3 added, ASM-4 added, ASM-5 added, ASM-6 added, LMB-2 added, LMB-3 added, LMB-4 added, LMB-5 added, LMB-6 added, LMB-7 added, LMB-8 added, LMB-9 added, LMB-10 added, LMB-11 added, LMB-12 added, LMB-13 added, LMB-14 added, LMB-15 added]
commit-subject: "feat(adapter-aws): implement the AWS Specification"
---

# RFC-0026: Bring the AWS adapter to its Specification

## Summary

`@genoacms/adapter-aws` was ported to descriptors and runtimes (RFC-0013) with every method body
kept, and has not run since. It misses three storage methods (WF1), swallows or replaces errors (WF2,
WF3), reads only a collection's first page (WF8), replaces documents on update (WF10), has no secrets
provider (WF14), and its deploy fails on the first run (WF15 to WF18). No test names a statement, and
the package publishes its tests (WF19). The architecture documents in `docs/architecture/adapter-aws/`
state the target. This RFC brings the package to it:

1. **The package becomes TypeScript**, built to `dist/` and published from there, like
   `adapter-gcp`. The hand-written `.d.ts` files go; the old API Gateway and `aws-serverless-express`
   code goes.
2. **Storage** implements OBJ-2 to OBJ-11: every contract method, AWS errors unchanged, the GCP
   adapter's listing shape and directory placeholders (WD1, WD2).
3. **Database** implements DDB-2 to DDB-7: paged strongly consistent scans, merging conditional
   updates, conditional creates, string keys only (WD3), plain JSON values.
4. **Secrets** is new: `./secrets` on Secrets Manager, ASM-1 to ASM-6 (WU3, WD5, WD6).
5. **Deployment** is rebuilt: one Lambda function with the Lambda Web Adapter and a public function URL,
   LMB-2 to LMB-15 (WU1, WD4, WD7).
6. **Tests at both levels** (WU4): unit tests with the SDK mocked, and contract tests against the
   author's account in `eu-central-1`, locally with the IAM user `genoacms-contract` and in CI with
   the OIDC role `genoacms-ci`. Every test title carries its statement IDs.

The author's decisions for it are WU1 to WU4 (2026-09-30): one RFC for all of it, TypeScript like
`adapter-gcp`, and the AWS resources of §The contract environment, created in the author's account
before implementation. The first contract run (2026-10-01) found that a forced secret delete
completes asynchronously (WF24, WS6) and that a function URL passes a forged `X-Forwarded-For`
through (WF25, WS2); the author decided WU5 and WU6, which changed ASM-6, LMB-4 and LMB-10 and added
LMB-15.

## Files

**Modify or create only.** All paths are under `packages/adapter-aws/` unless they start with `/`.

| File | Change |
| :-- | :-- |
| `package.json` | modify: §The package |
| `tsconfig.json` | create: `adapter-gcp`'s `tsconfig.json`, unchanged |
| `.eslintrc.cjs` | modify: extends `standard-with-typescript`, as `adapter-gcp`'s |
| `vitest.config.ts` | create: `include: ['src/**/*.test.ts', 'test/**/*.test.ts']` |
| `src/shared.ts` | create from `src/shared.js`: AWS-1 to AWS-4, plus `isAwsError` (§Shared) |
| `src/storage/descriptor.ts`, `src/storage/runtime.ts` | create from the `.js` files: OBJ-1 to OBJ-11 |
| `src/database/descriptor.ts`, `src/database/runtime.ts`, `src/database/values.ts` | create: DDB-1 to DDB-7 |
| `src/secrets/descriptor.ts`, `src/secrets/runtime.ts` | create: ASM-1 to ASM-6 |
| `src/deployment/descriptor.ts`, `src/deployment/settings.ts` | create: LMB-1 to LMB-3 |
| `src/deployment/stage.ts` | create from `stage.js`: LMB-4 to LMB-6, and the entry of LMB-15 |
| `src/deployment/functions.ts` | create: LMB-8 to LMB-13 |
| `src/deployment/procedure.ts` | create from `procedure.js`: LMB-7, LMB-14, and the order of the steps |
| `src/**/*.test.ts` | create: §Tests, unit and integration |
| `test/contract/aws.ts` | create: the opt-in switch, the environment, the run's names, the run's table |
| `test/contract/{storage,database,secrets,deployment}.test.ts` | create: §Tests, contract |
| `test/contract/artifact/{package.json,handler.js}` | create: §The deploy artifact |
| `test/conformance.test.ts` | create from `conformance.test.js`, on the run's bucket prefix and table |
| every other `src/**/*.js`, `src/**/*.d.ts`, `test/conformance.test.js`, `deployment/assets/` | delete |
| `/scripts/test-level.mjs` | modify: §Test levels |
| `/.github/workflows/ci.yml` | modify: pass `GENOACMS_TEST_AWS_LAMBDA_ROLE`; drop `GENOACMS_TEST_AWS_TABLE` |
| `/docs/README.md` | modify: Test levels (the AWS variables), the AWS rows |
| `/.changeset/<name>.md` | create: `@genoacms/adapter-aws` minor |

## Specification

The statements are those of `docs/architecture/adapter-aws/`, whose text is exact and normative:
OBJ-2 to OBJ-11, DDB-2 to DDB-7, ASM-1 to ASM-6 and LMB-2 to LMB-14 are added (`State: new (RFC-0026)`).
AWS-1 to AWS-4, OBJ-1, DDB-1 and LMB-1 stay as they are; they only gain tests. Everything below is
what the implementer needs beyond them.

### The package

`package.json`:
- `"files": ["dist"]`; scripts `"build": "rimraf dist && tsc"`, `"prepublishOnly": "pnpm run build"`, `"test": "vitest run"`, `"test:contract": "vitest run test"`.
- `exports`, each with `types` and `import` under `./dist/…` as in `adapter-gcp`: `./storage` (`descriptor`), `./storage/runtime`, `./database`, `./database/runtime`, `./secrets`, `./secrets/runtime`, `./deployment`.
- `dependencies`: add `@aws-sdk/client-secrets-manager`; remove `@aws-sdk/client-api-gateway` and `uuid`; keep `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `@aws-sdk/s3-request-presigner`, `@aws-sdk/client-dynamodb`, `@aws-sdk/client-lambda`, `archiver`, `@sveltejs/adapter-node`, `@genoacms/contracts`. Every `@aws-sdk/*` at the same current minor version.
- `devDependencies`: add `aws-sdk-client-mock`, `@types/archiver`, `@typescript-eslint/eslint-plugin`, `eslint-config-standard-with-typescript`, `rimraf`; remove `dotenv`, `jsdoc`, `eslint-config-standard`.
- `publishConfig: { "provenance": true }`.

Descriptor option types are declared as in `adapter-gcp`: an exported interface per descriptor, and
the module augmentation of `@genoacms/contracts` (`StorageAdapters`, `DatabaseAdapters`,
`SecretsAdapters`, `DeploymentTargets`) under the same specifiers.

### Shared

```ts
export interface AwsCredentials { accessKeyId: string, secretAccessKey: string, sessionToken?: string }
export function unknownOptions (options: unknown, allowed: readonly string[]): string[]
export function requireString (options: unknown, key: string): string[]
export function clientConfig (region: string, credentials?: AwsCredentials): { region: string, credentials?: AwsCredentials }
/** True when `error` is an AWS SDK error named `name`. */
export function isAwsError (error: unknown, name: string): boolean
```

`isAwsError` compares `error.name` only. The SDK sets it to the exception's name
(`NoSuchKey`, `ResourceNotFoundException`, …).

### Storage

`runtime.ts` keeps one closure per provider as today. `uploadObject` without a condition uses
`new Upload({ client, params: { Bucket, Key, Body } }).done()`. Directory listings for OBJ-10 and OBJ-11
use `ListObjectsV2` with `Prefix: name`, without delimiter, following `NextContinuationToken`.
`DeleteObjects` sends `{ Objects: [{ Key }…], Quiet: true }`, so only failures come back in `Errors`.
`CopySource` encodes the name with `encodeURIComponent`, and S3 decodes `%2F`.

### Database

`values.ts` exports `toItem(document, path?)`, `toAttribute(value, path)`, `fromItem(item)` and
`fromAttribute(value)`, implementing DDB-3 by hand, not with `@aws-sdk/util-dynamodb`, whose
behavior for `undefined`, class instances and numbers differs from DDB-3. `#key` is the expression
attribute name for the collection's key. `UpdateItem` names the fields `#f0, #f1, …` with values
`:v0, :v1, …`, in `Object.keys(data)` order, skipping `undefined` values; with no field left it
sends nothing and returns. The error messages are `database/unsupported-key-type: <name>`,
`database/unsupported-value: <path>` and `database/key-immutable: <key>`.

### Secrets

`ASM-3`'s `secrets/not-a-string: <key>` applies when `SecretString` is `undefined`. ASM-6's wait
uses `DELETE_POLL_MS = 250` and `DELETE_TIMEOUT_MS = 30_000`, waits with `setTimeout` and measures
with `Date.now()`, so fake timers drive it; the deadline is checked after each failed read.

### Deployment

```ts
export interface AwsDeploymentOptions {
  region: string
  role: string
  artifactBucket: string
  functionName?: string
  memory?: number
  timeoutSeconds?: number
  origin?: string
  credentials?: Secret<AwsCredentials>
}
```

`settings.ts` exports `SETTING_KEYS`, `validateSettings(options): string[]` (LMB-3) and
`functionEnvironment(options): Record<string, string>` (LMB-10). `stage.ts` exports
`stageLambdaApp(buildDir, app)`, `installProductionDependencies(dir)` and `zipDirectory(dir, out)`.
`stageLambdaApp` writes `genoacms-lambda.js` from the string constant `LAMBDA_ENTRY` (LMB-15).
`installProductionDependencies` runs `npm` with `execFile`, the arguments of LMB-5 plus `--libc=glibc`,
and includes the process's `stderr` in `deploy/install-failed: <stderr>`. `functions.ts` exports
`createFunctionOperations(lambda, options, key)` with `lookup()`, `create()`, `update()`,
`ensurePublicUrl()` and `functionUrl()`, and uses the SDK's `waitUntilFunctionActiveV2` and
`waitUntilFunctionUpdatedV2` with `maxWaitTime: 600`. A waiter that ends in failure is mapped by
LMB-12, reading `State`/`StateReason` or `LastUpdateStatus`/`LastUpdateStatusReason` from
`GetFunctionConfiguration`.

The procedure's order: stage, install, zip, upload (LMB-7), lookup (LMB-8), create (LMB-9) or update
(LMB-11), print the URL (LMB-13).

### The contract environment

| Variable | Meaning |
| :-- | :-- |
| `GENOACMS_TEST_AWS` | `1` runs the contract tests; anything else skips them, one skipped test per file |
| `GENOACMS_TEST_AWS_REGION` | the region, `eu-central-1` |
| `GENOACMS_TEST_AWS_BUCKET` | `genoacms-contract-<account>`, for objects and the deploy's artifacts |
| `GENOACMS_TEST_AWS_LAMBDA_ROLE` | the ARN of `genoacms-contract-lambda`, the deployed function's role |

Credentials come only from the SDK's default chain: the IAM user's profile on the author's machine
(`aws configure`, done by the author; no test reads a credentials file), the OIDC role in CI. The
policy `genoacms-contract` allows only the names below.

Each run takes a unique `runId` (base-36 time and 6 random hex characters) and touches only:
- objects under `genoacms-contract/<runId>/`, and the artifact `.genoacms/deployment/genoacms-contract-<runId>.zip`;
- one table `genoacms-contract-<runId>`, key `id` of type string, on-demand, created by `aws.ts`'s `createRunTable()` in the database files' `beforeAll` and deleted in `afterAll`;
- secrets named `genoacms-contract/<runId>/<name>`;
- the function `genoacms-contract-<runId>`.

Each file removes what it created in `afterAll` through the SDK directly, not through the runtime
under test, and a failed cleanup fails the file. The bucket's lifecycle rule expires anything left
after one day.

### The deploy artifact

`test/contract/artifact/` is a build directory without dependencies, shaped like adapter-node's:
`package.json` `{ "name": "genoacms-contract", "type": "module" }` and `handler.js`, which exports
`handler(request, response)` answering every request with 200 and the JSON
`{ env: { NODE_ENV, PORT, ADDRESS_HEADER, ORIGIN, PROTOCOL_HEADER, HOST_HEADER }, headers }` from
`process.env` and the request. The staged `genoacms-lambda.js` serves it (LMB-15).

### Test levels

`scripts/test-level.mjs`: the `unit` run of `@genoacms/adapter-aws` also excludes
`src/deployment/stage.test.ts`; the `integration` level adds
`{ dir: 'packages/adapter-aws', args: ['src/deployment/stage.test.ts'] }`; the `contract` entry of
`packages/adapter-aws` becomes `['test/conformance.test.ts', 'test/contract']`.

## Non-goals

- No change to `@genoacms/contracts`, `@genoacms/conformance` or core.
- No custom domain, CloudFront, response streaming, ARM functions, VPC access or provisioned concurrency.
- No removal of API Gateway APIs an earlier deploy created (WD4's cost).
- No table creation by the runtime (WU2), and no number keys (WD3).
- No IAM grant checks in `genoa deploy`.
- Not creating AWS resources in code: the bucket, the roles, the policy, the OIDC provider and the user are the author's, created before implementation.
- The GCP adapter's `startAfter` (GF21) and `$` replacement (GF22) findings: AWS avoids both by its own statements; the GCP fixes stay their own RFCs.

## Tests

Unit tests mock the SDK clients with `aws-sdk-client-mock` and assert the commands sent. Contract
tests run the runtimes and the procedure against the real services (§The contract environment).

### Shared and descriptors (`src/*/descriptor.test.ts`, unit)

- `AWS-2, OBJ-1: the storage descriptor names its runtime, decodes credentials as JSON and refuses unknown keys`: given `{ region: 'eu-central-1', bucket: 'x' }`, when validated, then the reasons are exactly `["unknown option 'bucket'"]`; the runtime specifier is `@genoacms/adapter-aws/storage/runtime` and `secretOptions` is `{ credentials: 'json' }`.
- `AWS-3, OBJ-1: the storage descriptor requires region`: given `{}`, `{ region: '' }` and `{ region: 1 }`, then each yields exactly `['region is required and must be a non-empty string']`.
- `AWS-2, AWS-3, DDB-1`: the same two tests for the database descriptor.
- `AWS-2, AWS-3, ASM-1`: the same two tests for the secrets descriptor, runtime `@genoacms/adapter-aws/secrets/runtime`.
- `LMB-1: loads adapter-node lazily and points it at the output directory`: when `svelteKitAdapter()` resolves, then it is `@sveltejs/adapter-node`'s module, and `svelteKitOptions({}, { outDir: 'o' })` is `{ out: 'o' }`; `procedure()` resolves the deploy procedure.
- `AWS-2, AWS-3, LMB-2: requires region, role and artifactBucket, and refuses accountId`: given `{ accountId: '1' }`, then the reasons contain `unknown option 'accountId'` and the required-string reason for each of the three.
- `LMB-3: refuses each invalid setting with its reason, in order`: given a valid base and each of `role: 'x'`, `functionName: 'a b'`, `functionName` of 65 characters, `memory: 127`, `memory: 10241`, `memory: 1.5`, `timeoutSeconds: 0`, `timeoutSeconds: 901`, `origin: 'https://a.example/path'`, then exactly the one reason LMB-3 names; given all invalid at once, then the five reasons in LMB-3's order.
- `LMB-3: accepts the boundaries`: `memory` 128 and 10240, `timeoutSeconds` 1 and 900, a 64-character `functionName`, `origin: 'http://localhost:5173'` yield no reason.

### Storage (`src/storage/runtime.test.ts`, unit)

- `AWS-4: passes credentials only when given, and keeps providers apart`: when two providers are created, one with credentials in `eu-central-1` and one without in `us-east-1`, then each client has its own region, and only the first has the static credentials.
- `OBJ-2: refuses an unregistered bucket before any request, in every method`: given a provider for bucket `a`, when each of the ten methods is called with bucket `b`, then each rejects or throws `bucket-unregistered` and no command was sent.
- `OBJ-3: returns the body and the ETag`: given `GetObject` answers a body and `ETag: '"e1"'`, then `{ data: body, version: '"e1"' }`.
- `OBJ-3: propagates NoSuchKey and other errors unchanged`: given `GetObject` rejects with an error named `NoSuchKey`, then `getObject` rejects with that same error object; likewise `AccessDenied`.
- `OBJ-4: builds the public URL from the provider's region, encoding the name`: given region `eu-central-1`, when `getPublicURL({ bucket: 'b', name: 'd/a b.txt' })`, then `https://b.s3.eu-central-1.amazonaws.com/d%2Fa%20b.txt`.
- `OBJ-5: presigns a GetObject for the whole seconds until expiry`: given a fixed clock and `expires` 90.9 s ahead, then the URL's `X-Amz-Expires` is `90` and its path is `/d/a.txt` on the bucket's host.
- `OBJ-6: ifAbsent sends IfNoneMatch and wins over ifVersion`: when uploaded with `{ ifAbsent: true, ifVersion: '"e"' }`, then one `PutObject` with `IfNoneMatch: '*'` and no `IfMatch`.
- `OBJ-6: ifVersion sends IfMatch`: then one `PutObject` with `IfMatch: '"e"'`.
- `OBJ-6: maps 412 and 409 to PreconditionFailedError with the reason`: given `PutObject` rejects with `$metadata.httpStatusCode` 412, then `PreconditionFailedError` with `storage/precondition-failed: b/n: object changed since it was read`; 409 with `ifAbsent`, then `…: object already exists`.
- `OBJ-6: propagates other errors of a conditional write unchanged`: given a 403, then that error object.
- `OBJ-6: writes unconditionally through the multipart uploader, propagating its errors`: without options, then no `PutObject` with a condition is sent and the `Upload` rejection is the same error object.
- `OBJ-7: moves by copy then delete, and deletes nothing when the copy fails`: then `CopyObject` with `CopySource: 'b/d%2Fa.txt'` and `Key` the new name, then `DeleteObject` of the old; given the copy rejects, then that error and no `DeleteObject`.
- `OBJ-7: propagates delete errors unchanged`.
- `OBJ-8: lists one level with the given limit and startAfter only`: then one `ListObjectsV2` with `Prefix`, `Delimiter: '/'`, `MaxKeys` and `StartAfter` when given, and neither key when not.
- `OBJ-8: hides placeholders and the directory itself, and returns directories as references`: given contents `d/`, `d/a.txt` (size 2), `d/x.folderPlaceholder`, a file without `Size`, and common prefixes `d/` and `d/s/`, then `files` is `d/a.txt` with size 2 and the sizeless file with size 0, and `directories` is `[{ bucket, name: 'd/s/' }]`.
- `OBJ-8: returns directories when there are no files`: given only common prefixes, then they are returned.
- `OBJ-9: writes the placeholder without reading first`: then exactly one `PutObject` of `e/.folderPlaceholder` with an empty body, and no `GetObject` or `HeadObject`.
- `OBJ-10: deletes every page of objects in batches of at most 1000`: given 2500 keys over two list pages, then three `DeleteObjects` of 1000, 1000 and 500 keys with `Quiet: true`.
- `OBJ-10: throws storage/delete-failed for a key the response reports`: given `Errors: [{ Key: 'f/1', Code: 'AccessDenied' }]`, then `storage/delete-failed: b/f/1: AccessDenied`.
- `OBJ-11: moves every object to the new prefix, keeping the rest of each name`: given `m/1`, `m/n/2` and a name containing `$&`, when moved to `n$&/`, then copies to `n$&/1`, `n$&/n/2` and deletes of the originals.
- `OBJ-11: stops at the first failure`: given the second copy rejects, then that error, and the second object was not deleted.

### Database (`src/database/*.test.ts`, unit)

- `DDB-2: refuses a collection without a string key before any request, in every method`: given `primaryKey.schema.type: 'number'`, then each of the five methods rejects with `database/unsupported-key-type: <name>` and nothing was sent.
- `DDB-3: writes and reads back every JSON value`: given a document with a string, an integer, a fraction, `true`, `null`, a nested array and a nested object, then `toItem` yields the attributes of DDB-3 and `fromItem(toItem(x))` equals `x`.
- `DDB-3: omits undefined fields`: `{ a: 1, b: undefined }` yields only `a`.
- `DDB-3: refuses every other value with its path`: `NaN` at `a`, `Infinity` at `b.c`, `undefined` at `l.1`, `1n`, a `Date` and a class instance each throw `database/unsupported-value: <path>`.
- `DDB-4: puts the document under a new UUID that overrides a key field, only if absent`: given data `{ id: 'x', t: 'a' }` and key `id`, then one `PutItem` whose `id` is a UUID other than `x`, with `ConditionExpression: 'attribute_not_exists(#key)'` and `#key` → `id`; the result is `{ reference: { collection, id: <uuid> }, data: <input> }`.
- `DDB-5: scans every page consistently and strips the key`: given two pages, then two `Scan` with `ConsistentRead: true`, the second with `ExclusiveStartKey`, and every item as a snapshot whose `data` has no key attribute.
- `DDB-6: reads consistently and strips the key`: then `GetItem` with `ConsistentRead: true` and a snapshot without the key attribute.
- `DDB-6: resolves undefined for a missing item`.
- `DDB-7: updates only the given fields, only if the document exists`: given `{ a: 1, b: undefined, c: 'x' }`, then one `UpdateItem` with `SET #f0 = :v0, #f1 = :v1` for `a` and `c`, and `ConditionExpression: 'attribute_exists(#key)'`; the result is `{ reference, data: <input> }`.
- `DDB-7: refuses to change the key`: given data with the key field, then `database/key-immutable: id` and nothing was sent.
- `DDB-7: deletes by key`: then `DeleteItem` of the key.
- `DDB-3, DDB-7: propagates SDK errors unchanged`: given `ResourceNotFoundException` from `GetItem` and `ConditionalCheckFailedException` from `UpdateItem`, then those error objects.

### Secrets (`src/secrets/runtime.test.ts`, unit)

- `ASM-2, ASM-3: reads SecretString by the key unchanged`: then `GetSecretValue` with `SecretId` equal to the key and the string returned.
- `ASM-3: resolves undefined only for ResourceNotFoundException`: given that error, then `undefined`; given `InvalidRequestException`, then that error object.
- `ASM-3: refuses a binary-only secret`: given no `SecretString`, then `secrets/not-a-string: <key>`.
- `ASM-4: puts a value into an existing secret`: then one `PutSecretValue` and `true`.
- `ASM-4: creates a missing secret, and puts again when another caller created it first`: given `PutSecretValue` rejects with `ResourceNotFoundException`, then `CreateSecret` with `Name` and `SecretString`; given that rejects with `ResourceExistsException`, then a second `PutSecretValue`, and `true`.
- `ASM-5: claims with one CreateSecret, and reports false when it exists`: then `true` after one `CreateSecret`; given `ResourceExistsException`, then `false`; given another error, then that error object.
- `ASM-6: deletes without recovery, and reports false for a missing secret`: then `DeleteSecret` with `ForceDeleteWithoutRecovery: true`; given `DeleteSecret` rejects with `ResourceNotFoundException`, then `false` and no `GetSecretValue` was sent.
- `ASM-6: waits until the secret is gone`: given `GetSecretValue` rejects twice with `InvalidRequestException`, then with `ResourceNotFoundException`, then `deleteSecret` resolves `true` only after three reads, 250 ms apart, the first at once; given it resolves a value on the first read, then `true` after one read.
- `ASM-6: propagates other errors while waiting`: given `GetSecretValue` rejects with `AccessDeniedException`, then that error object.
- `ASM-6: gives up after 30 seconds`: given `GetSecretValue` always rejects with `InvalidRequestException`, then `secrets/delete-timeout: <key>` once 30 s have passed, and not before.

### Deployment (`src/deployment/*.test.ts`)

- `stage.test.ts` (integration) › `LMB-4: copies the build, adds run.sh and the entry, and changes nothing else`: given a build directory with `package.json`, `index.js` and `client/a.js`, then the staged app holds the same bytes for each, `run.sh` with exactly LMB-4's content and mode `0755`, and `genoacms-lambda.js`.
- `stage.test.ts` (integration) › `LMB-4: replaces a genoacms-lambda.js of the build`: given a build holding `genoacms-lambda.js` with other content, then the staged one is the entry.
- `stage.test.ts` (integration) › `LMB-15: serves the handler with the request context's source address`: given a staged app whose `handler.js` echoes the request's headers as JSON, when `node genoacms-lambda.js` runs with a free `PORT` and is sent `x-amzn-request-context: {"http":{"sourceIp":"198.51.100.7"}}` and `x-genoacms-client-address: 203.0.113.9`, then the handler received `x-genoacms-client-address` `198.51.100.7`.
- `stage.test.ts` (integration) › `LMB-15: drops a client's address header when the context has none`: when sent `x-genoacms-client-address: 203.0.113.9` with no `x-amzn-request-context`, with one that is not JSON, and with one whose `http.sourceIp` is a number, then each time the handler received no `x-genoacms-client-address`.
- `stage.test.ts` (integration) › `LMB-15: answers 404 when the handler passes the request on`: given a `handler.js` that calls its third argument, then 404 with an empty body.
- `stage.test.ts` (integration) › `LMB-4: refuses a build without package.json`: then `deploy/no-runtime-package: <buildDir>/package.json is missing; build with genoa build`.
- `stage.test.ts` (integration) › `LMB-5: installs for Linux x64 without a shell, and fails with npm's output`: given an app whose `package.json` is not valid JSON, then `deploy/install-failed: ` followed by npm's error output.
- `stage.test.ts` (integration) › `LMB-6: zips exactly the staged directory, keeping run.sh executable`: then the archive's entries are the staged files at its root, and `run.sh`'s entry has mode `0755`.
- `procedure.test.ts` (unit) › `LMB-5: runs npm install with the Linux x64 arguments`: with `execFile` mocked, then `npm` with exactly `install --omit=dev --no-audit --no-fund --os=linux --cpu=x64 --libc=glibc` in the app directory.
- `procedure.test.ts` (unit) › `LMB-7: uploads the archive under the function's key, and stops on failure`: then `PutObject` to the artifact bucket, key `.genoacms/deployment/<functionName>.zip`; given it rejects, then `deploy/upload-failed: <message>` with that error as `cause`, and no Lambda command was sent.
- `procedure.test.ts` (unit) › `LMB-8: treats only ResourceNotFoundException as absent`: given `GetFunction` rejects with `AccessDeniedException`, then that error, and neither `CreateFunction` nor `UpdateFunctionCode` was sent.
- `procedure.test.ts` (unit) › `LMB-9, LMB-10: creates the function with the adapter layer, waits, then opens its URL`: given no function and no `origin`, then `CreateFunction` with exactly LMB-9's fields and LMB-10's variables with `PROTOCOL_HEADER` and `HOST_HEADER`, a wait until active, `CreateFunctionUrlConfig` with `AuthType: 'NONE'`, `InvokeMode: 'BUFFERED'`, and the two `AddPermission` calls of LMB-9.
- `procedure.test.ts` (unit) › `LMB-9: tolerates an existing URL and existing statements`: given each of the three rejects with `ResourceConflictException`, then the deploy resolves.
- `procedure.test.ts` (unit) › `LMB-10: sets ORIGIN instead of the forwarded headers when origin is given`.
- In both, `ADDRESS_HEADER` is `x-genoacms-client-address` and no `XFF_DEPTH` is set.
- `procedure.test.ts` (unit) › `LMB-11: updates code, then the whole configuration, waiting after each`: given the function exists, then `UpdateFunctionCode`, a wait, `UpdateFunctionConfiguration` with LMB-9's fields except `FunctionName`, `Architectures` and `Code`, a wait, then the URL ensured.
- `procedure.test.ts` (unit) › `LMB-12: reports a failed update with its reason`: given the wait fails and `GetFunctionConfiguration` reports `LastUpdateStatus: 'Failed'` and `LastUpdateStatusReason: 'r'`, then `deploy/function-failed: r` with the waiter's error as `cause`; likewise `State: 'Failed'` with `StateReason` after a create.
- `procedure.test.ts` (unit) › `LMB-13: prints the function URL`: then `console.info` with `Function URL: <FunctionUrl>`.
- `procedure.test.ts` (unit) › `LMB-14: uses the given credentials for S3 and Lambda`: then both clients have them; without, neither has.
- `procedure.test.ts` (unit) › `LMB-2: defaults functionName, memory and timeout`: then `genoacms`, 1024 and 30.

### Storage (`test/contract/storage.test.ts`, contract)

- `OBJ-3: reads an object with its ETag as the version`: given an uploaded object, then the stream yields its bytes and `version` equals the ETag `HeadObject` reports.
- `OBJ-3: rejects a missing object with NoSuchKey`.
- `OBJ-5: serves the object through a presigned URL`: then an unauthenticated `GET` answers 200 with the content.
- `OBJ-6: creates with ifAbsent, and refuses a second create`: as STO-6's contract test, with `PreconditionFailedError` and `object already exists`.
- `OBJ-6: writes on the current version, and refuses a stale one`: as STO-6's.
- `OBJ-6: overwrites without a condition`.
- `OBJ-7: moves an object within its bucket, and deletes it`.
- `OBJ-8: lists one level without placeholders or the directory itself`: given `d/a.txt`, `d/.folderPlaceholder`, `d/sub/b.txt` and `d/`, then `files` is exactly `d/a.txt` and `directories` exactly `d/sub/`.
- `OBJ-8: pages a listing with limit and startAfter`: given `p/1`, `p/2`, `p/3`, then `limit: 2` lists `p/1`, `p/2`, and `startAfter: <prefix>p/2` lists `p/3`.
- `OBJ-9: creates a directory that its parent's listing shows`.
- `OBJ-10: deletes every object under a directory, at every depth, and nothing beside it`: given `f/1`, `f/g/2`, `f/g/h/3`, `fx/4`, then only `fx/4` remains.
- `OBJ-11: moves every object under a directory, at every depth`: given `m/1`, `m/n/2`, when moved to `mv/`, then both are under `mv/` and none under `m/`.

### Database (`test/contract/database.test.ts`, contract, on the run's table)

- `DDB-2, DDB-3, DDB-4, DDB-6: creates a document and reads back every JSON value`: given the document of the unit test, when created and read, then `data` equals it and has no `id`.
- `DDB-4: never overwrites a document`: given a created document with ID *i*, when a document whose data carries `id: i` is created, then it gets a new ID and the first document reads back unchanged.
- `DDB-5: reads a collection across pages`: given 30 documents of 50 KB each (over 1 MB in all), then `getCollection` returns all 30.
- `DDB-6: resolves undefined for a missing document`.
- `DDB-7: merges an update, and fails on a missing document`: given `{ a: 1, b: 2 }`, when updated with `{ b: 3 }`, then it reads `{ a: 1, b: 3 }`; given a missing ID, then `ConditionalCheckFailedException`.
- `DDB-7: deletes, and deleting again is not an error`.

### Secrets (`test/contract/secrets.test.ts`, contract)

- `ASM-2, ASM-3: reads a secret that never existed as undefined`.
- `ASM-4: creates a missing secret when overwriting, and overwrites it`: then `true`, the first value, then the second value reads back.
- `ASM-5: claims an absent key once, and a second claim keeps the first value`.
- `ASM-6: deletes a secret at once, and reports false for one that does not exist`: then `true`, reading it resolves `undefined`, and deleting again resolves `false`.
- `ASM-3: propagates the failure to read a secret scheduled for deletion`: given a secret deleted through the SDK with a 7-day recovery window, then `getSecret` rejects with `InvalidRequestException`; the test then force-deletes it.

### Deployment (`test/contract/deployment.test.ts`, contract, sequential, one function)

- `LMB-7, LMB-8, LMB-9, LMB-10, LMB-13, LMB-14: creates a public function with the web adapter, and prints its URL`: given no function by the run's name and no `credentials`, when the procedure deploys the artifact with `role` the run's Lambda role, then it prints `Function URL: https://…`, and an anonymous `GET` of that URL with `X-Forwarded-For`, `x-genoacms-client-address` and `x-amzn-request-context` forged (address `203.0.113.9`, the context `{"http":{"sourceIp":"203.0.113.9"}}`) answers 200 with `env` of LMB-10 without `ORIGIN`, `headers.host` equal to the URL's host, `headers['x-forwarded-proto']` `https`, and `headers['x-genoacms-client-address']` equal to `http.sourceIp` of the `x-amzn-request-context` the handler received, an IP address other than `203.0.113.9` (WS1, WS2, WS3, WD7). The title becomes `LMB-7, LMB-8, LMB-9, LMB-10, LMB-13, LMB-14, LMB-15: …`.
- `LMB-11: updates code and configuration`: when deployed again with `memory: 512` and `origin: 'https://cms.example'`, then `GetFunctionConfiguration` reports 512 MB, and a `GET` of the URL answers `env.ORIGIN` `https://cms.example` and no `PROTOCOL_HEADER`.

`test/conformance.test.ts` runs the conformance suites as today, on the run's prefix and table, with
the titles `OBJ-3: S3 conformance` and `DDB-4, DDB-5, DDB-6, DDB-7: DynamoDB conformance`.

## Steps

1. **Author (stop point).** In the account, `eu-central-1`: the bucket `genoacms-contract-<account>`
   with a one-day expiry, the role `genoacms-contract-lambda`, the policy `genoacms-contract`, the
   GitHub OIDC provider, the role `genoacms-ci` trusted only for `GenoaCMS/genoacms` on
   `refs/heads/main`, and the user `genoacms-contract`, whose access key the author creates and
   configures with `aws configure`. The repository variables `AWS_TEST_ROLE_ARN`, `AWS_TEST_REGION`,
   `AWS_TEST_BUCKET` and `AWS_TEST_LAMBDA_ROLE` are set **only in step 7**: set earlier, CI would run
   the old adapter's conformance run on `main` and fail it.
2. Baseline: `node scripts/test-level.mjs unit` passes; `check-results` reports no AWS error.
3. The package (§The package), converting the unchanged modules to TypeScript first, with the old
   tests passing on the converted code. One commit, `refactor(adapter-aws): TypeScript, built to dist`.
4. Tests, written from the Specification and this RFC by an agent session that has not seen the
   implementation, each new unit and integration test marked as an expected failure where the code
   does not meet it yet. Committed before the code.
5. The code, by service: storage, database, secrets, deployment. Each removes its tests'
   expected-failure markers and changes no assertion.
6. Run §Verification locally with the author's profile.
7. CI: `test-level.mjs`, `ci.yml`, `docs/README.md`; then the repository variables. Run on a pull
   request, then on `main`.
8. Update the architecture documents to current: markers removed, test files named, WF1
   to WF25 fixed, WS1 to WS3 recorded as run, `verified` updated; mark this RFC implemented.

## Verification

```bash
pnpm --filter @genoacms/adapter-aws run build     # no errors; dist/ holds the four services
node scripts/test-level.mjs unit                  # passes
node scripts/test-level.mjs integration           # LMB-4 to LMB-6 and LMB-15 pass
GENOACMS_TEST_AWS=1 GENOACMS_TEST_AWS_REGION=eu-central-1 GENOACMS_TEST_AWS_BUCKET=genoacms-contract-<account> \
  GENOACMS_TEST_AWS_LAMBDA_ROLE=arn:aws:iam::<account>:role/genoacms-contract-lambda \
  AWS_PROFILE=genoacms-contract node scripts/test-level.mjs contract   # every OBJ, DDB, ASM, LMB test passes
node docs/tools/check-results.mjs docs unit=… integration=… conformance=… contract=… e2e=…   # 0 errors
node docs/tools/check-docs.mjs docs              # 0 errors
cd packages/adapter-aws && npm pack --dry-run    # only dist/, package.json, README: no test file
```

Afterwards nothing is left under `genoacms-contract/` except within the one-day expiry, no table,
secret or function named `genoacms-contract-*` exists.

A falsification audit of each statement this RFC adds (WORKFLOW §6.3), by an agent that did not
write the code, recorded as a Verification entry in the AWS README.

## Critique

**Pros**
- The adapter meets the contract core relies on, including the three storage methods whose absence breaks core's storage browser and publication on AWS today.
- Every statement is tested at the boundary it names, and the contract tests settle WS1 to WS3 by running them rather than trusting documentation.
- The deploy has no API Gateway and only a few lines of entry: adapter-node's handler runs as it does on the Node target, so one server serves both.
- The client address cannot be forged through `X-Forwarded-For`, which a function URL passes through (WF25).
- The TypeScript conversion removes the hand-written `.d.ts` files that could drift from the code, and stops publishing tests.

**Cons & trade-offs**
- One RFC for everything is a long review and a long implementation; a defect found in the deploy blocks storage fixes that are ready. The steps commit per service to limit that.
- The configuration of every existing AWS deploy breaks: `accountId` is refused, `role` must be an ARN, and the next deploy creates a new function URL beside the old API Gateway. Since the adapter has not deployed since the port, no working instance is expected, but the release must be a minor version.
- Contract runs cost money on every push to `main` (Lambda, DynamoDB on demand, Secrets Manager by the hour, S3), fractions of a cent per run by AWS's published prices, and fail when AWS has an outage.
- The unit tests encode the SDK's command shapes through `aws-sdk-client-mock`; an SDK upgrade that changes them breaks tests that do not touch real behavior.
- `aws-sdk-client-mock` and TypeScript tooling are new dev dependencies.
- The entry replaces adapter-node's `index.js`, dropping its graceful shutdown and its `SHUTDOWN_TIMEOUT`, `IDLE_TIMEOUT` and socket-activation settings (WD7), and it depends on adapter-node's `handler.js` export and its third-argument fallthrough.
- A secret delete takes about a second, and a delete that Secrets Manager does not finish within 30 s throws though the delete itself was accepted (WD6).

**Blindspots & missed edge cases**
- LMB-12's failure paths cannot be provoked against the real service on demand, so they are verified at `unit` only.
- The layer version is pinned at 30 from its README; a newer layer, or one withdrawn from a region, needs a change here. The contract test detects a withdrawn one, not a newer one.
- `npm install --os=linux --cpu=x64 --libc=glibc` selects prebuilt binaries by their `package.json` fields; a package that downloads its binary in an install script ignores them.
- A presigned URL signed under the function's role stops working when the role's session ends (OBJ-5); the contract test signs with the IAM user and cannot show it.
- Secrets Manager's version limit under frequent overwrites (WS4) stays untested.
- A crashed run leaves its table, secrets or function behind until someone removes them; only the bucket expires by itself.
- That a client cannot forge `x-amzn-request-context` rests on the contract test against today's Web Adapter; a layer that passes a client's header through would reopen WF25, and only that test would catch it.
- Behind CloudFront, `sourceIp` is CloudFront's address (WD7's cost); a future CloudFront target needs its own rule.
