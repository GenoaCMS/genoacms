# GCP deployment: Cloud Run functions

Part of the [GCP adapter architecture](README.md). Markers, IDs and test references as defined there.
Statement codes: `DEP` (the deployment target), `ADP` (the SvelteKit adapter).

# Design

## 1. Role

The `gcp` deployment target runs GenoaCMS as one **Cloud Run function (2nd gen)**. Two packages
make that:

- `@genoacms/sveltekit-adapter-cloud-run-functions` shapes the SvelteKit build into something a function can serve (S3);
- `@genoacms/adapter-gcp/deployment` is the target's descriptor and deploy procedure (S1, S2).

```
genoa build gcp                          genoa deploy gcp
  vite build ──SvelteKit adapter──▶ .genoacms/build/   ──procedure──▶ Cloud Functions API
                                    + package.json, vendor/          ──▶ Cloud Build (buildpacks: npm install)
                                    (configuration.md D6, D9)        ──▶ Cloud Run service
```

The SvelteKit adapter is a fork of `@sveltejs/adapter-node`'s shape for a function, which has no
server of its own to start: the Functions Framework calls an exported handler.

## 2. Decisions

**GD1. The deploy waits for the platform and fails when it fails (GF1, GF2, GF6).** DEP-9 to DEP-12.
*Why:* a deploy that reports success when the platform rejected it is worse than no report, and a
buildpack install failure (`configuration.md` D9 critique) is exactly the case that must surface.
*Cost:* `genoa deploy` takes as long as Cloud Build, a few minutes, instead of returning after the upload.

**GD3. Function settings are target options (GF3, GQ1).** DEP-2 to DEP-4. The runtime default is
`nodejs22`, the oldest Node runtime still in support at the time of writing. Every other default
keeps the adapter's earlier behavior.
*Why:* instance limits, memory and the runtime identity are per-instance operational decisions, not
the adapter's. The service account is the practical fix for GF4, because it lets an operator run the
function as a dedicated, narrowly-granted account (README §4).
*Cost:* seven more options to validate and document. A well-formed but unsupported `memory` or
`runtime` value is refused by the platform during the operation, which GD1 reports, not by the
descriptor at build time.

**The whole configuration is written on every deploy (DEP-10).** No field mask. The config is
therefore the source of truth, and a setting changed in the console is reverted by the next deploy.

**Only the artifact is uploaded (DEP-6, DEP-7).** No project source, no config and no credential
leave the machine (`configuration.md` F9, F15).

## 3. Findings

| # | Finding | State |
| :-- | :-- | :-- |
| GF1 | *History.* The deploy returned without awaiting the long-running operation. A buildpack failure was invisible, and `genoa deploy` printed `Code deployed`. | fixed, RFC-0021 |
| GF2 | *History.* The upload's HTTP status was never checked, so a rejected upload continued to `createFunction`. | fixed, RFC-0021 |
| GF3 | *History.* `nodejs20` (end of life April 2026), one instance, ingress `ALLOW_ALL`, and no memory, timeout or service account, all hardcoded. The function ran as the default compute account. | fixed, RFC-0021 |
| GF6 | *History.* Any error from `getFunction` counted as "does not exist" and led to a misleading `createFunction`. | fixed, RFC-0021 |
| GF7 | **`getClientAddress` returns the whole `X-Forwarded-For` header** (ADP-6). Behind Google's front end it is a comma-separated list whose first entries the client can set. Anything that trusts it as "the client's address", which sign-in throttling would (`configuration.md` Q5), must take the entry Google appended, the last one. Q5 decides who reads it. | open |
| GF11 | **The SvelteKit adapter's tests are disabled and stale.** Its `test` script only echoes `tests temporarily disabled`, and `tests/smoke.spec.js` imports `create_kit_middleware`, which the handler no longer exports. Every `ADP` statement is unverified by tests. The live deploy exercises them together, not one by one. | open |
| GF14 | **`env.js` is dead code.** The adapter copies `env.js`, adapter-node's reader for `ORIGIN`, `XFF_DEPTH`, `ADDRESS_HEADER`, `BODY_SIZE_LIMIT` and similar variables, but the handler never imports it. The `envPrefix` option and all those variables have no effect. The origin comes only from forwarded headers (ADP-5). | open |

## 4. History

*History.*
- **Until RFC-0007 (2026-09-27)**, the deploy archived the **project source** from the project root, ignoring only `node_modules`, `.git`, `.github`, `.gitignore`, `.genoacms` and `build`. It injected entry snippets so that GCP would install and build core remotely (`configuration.md` F9, F15). The service-account key inside `genoa.config/` was uploaded with it, and the injected build snippet no longer existed, so the deploy was broken.
- **RFC-0007** replaced that with the artifact upload, and kept the function settings unchanged (its non-goal). That is why GF3 existed.
- **RFC-0021 (2026-09-28)** added GD1 and GD3.
- **The SvelteKit adapter** was written in 2024-11 to adapt SvelteKit to Cloud Run functions instead of using Firebase's adapter.

## 5. Open questions

| # | Question | Recommendation |
| :-- | :-- | :-- |
| GQ1 | Which function settings become options? | Answered by GD3. Concurrency (`maxInstanceRequestConcurrency`, which needs at least one vCPU), CPU and extra environment variables are left out until a use appears. Environment variables in particular would put values into the function's visible configuration, where a secret must never go. |
| GQ2 | Should `genoa deploy` check the runtime identity's grants (README §4) before deploying? | No. It would need `testIamPermissions` on every resource the manifest names, with the operator's credentials rather than the runtime's. The grants are documented instead, and a missing one fails loudly at runtime. |

## 6. Verification

- Unit tests, with the SDK mocked, cover the `DEP` statements marked below.
- **GS2, for GD1: not run yet (author, live).** Deploy an artifact whose `package.json` names a dependency that does not exist. Expected: `genoa deploy` exits non-zero with `deploy/function-failed` and the build error, and the previous revision still serves. Then deploy the real artifact. Expected: it exits zero and prints the URL.
- The first live deploy of core (2026-09-28, author) exercised DEP-5 to DEP-10 and ADP-1 to ADP-5 together, before GD1.

# Specification

## S1. Descriptor (`@genoacms/adapter-gcp/deployment`)

| # | Statement | Test |
| :-- | :-- | :-- |
| DEP-1 | Kind `deployment`. It imports no SDK. `svelteKitAdapter()` loads `@genoacms/sveltekit-adapter-cloud-run-functions` lazily, and `svelteKitOptions` maps the build's `outDir` to the adapter's `{ out: outDir }`. `procedure()` loads the deploy procedure lazily. `credentials` is decoded as JSON. | `deployment/descriptor.test.ts` › is a deployment target…; loads the cloud-run SvelteKit adapter…; loads its procedure lazily |
| DEP-2 | Options: `projectId: string` and `region: string`, both required non-empty (COM-3); `functionName?: string`, default `genoacms`; `credentials?: Secret<ServiceAccount>`, the operator identity, resolved on the operator's machine and never embedded in the build; and the seven settings of DEP-3. Any other key is refused (COM-2). | `deployment/descriptor.test.ts` › requires a project id and a region, and refuses unknown keys; accepts every function setting… |
| DEP-3 | Settings, all optional, with defaults and API mapping:<br>`runtime`: `/^nodejs\d+$/`, default `nodejs22` → `buildConfig.runtime`<br>`memory`: `/^\d+(M\|Mi\|G\|Gi)$/`, platform default → `serviceConfig.availableMemory`<br>`timeoutSeconds`: integer 1–3600, platform default → `serviceConfig.timeoutSeconds`<br>`minInstances`: integer ≥ 0, default 0 → `serviceConfig.minInstanceCount`<br>`maxInstances`: integer ≥ 1, default 1 → `serviceConfig.maxInstanceCount`<br>`ingress`: `all` \| `internal` \| `internal-and-gclb`, default `all` → `serviceConfig.ingressSettings` 1 \| 2 \| 3<br>`serviceAccount`: `/^[^@\s]+@[^@\s]+$/`, default the project's compute account → `serviceConfig.serviceAccountEmail` | `deployment/settings.test.ts` › builds on nodejs22…; keeps the service settings…; maps every setting… |
| DEP-4 | An invalid present setting yields exactly one reason, in DEP-3's key order: `runtime must be a Node.js runtime such as 'nodejs22'`, `memory must be a size such as '512Mi' or '1Gi'`, `timeoutSeconds must be an integer from 1 to 3600`, `minInstances must be an integer of at least 0`, `maxInstances must be an integer of at least 1`, `ingress must be 'all', 'internal' or 'internal-and-gclb'`, `serviceAccount must be a service account email`. After those, when both instance counts are valid and `minInstances > maxInstances`: `minInstances must not exceed maxInstances`. | `deployment/settings.test.ts` › names each invalid setting…; refuses more minimum than maximum instances |

## S2. Deploy procedure

| # | Statement | Test |
| :-- | :-- | :-- |
| DEP-5 | The procedure never reads `process.cwd()`. It works only from the build directory and the work directory it is given. | `deployment/procedure.test.ts` › uploads the archive, then creates… |
| DEP-6 | **Staging.** Copy the build directory to `<workDir>/app`. Without `<buildDir>/package.json`, throw `deploy/no-runtime-package: <buildDir>/package.json is missing; build with genoa build`. Set `"main": "function.js"` in the copied `package.json`, keeping every other field, and write `function.js` with exactly the entry module below. | `deployment/archive.test.ts` › adds the function entry…; refuses an artifact without its runtime package.json |
| DEP-7 | **Archive.** A zip (level 9) of exactly the staged directory, at its root: no globbing, no ignore list, no symlink following. | `deployment/archive.test.ts` › zips exactly the staged files |
| DEP-8 | **Upload.** `generateUploadUrl` in `projects/<projectId>/locations/<region>`, then `PUT` the zip to the returned URL with `Content-Type: application/zip`. A response that is not `ok` throws `deploy/upload-failed: <status> <statusText>` and nothing else is called. A response with no URL or no storage source throws `Upload URL not found`. | `deployment/procedure.test.ts` › uploads the archive…; stops when the upload is refused… |
| DEP-9 | **Lookup.** `getFunction(projects/<p>/locations/<r>/functions/<functionName>)`. It exists when the call resolves, and is absent only on gRPC `NOT_FOUND` (5). Any other error propagates, and neither create nor update is called. | `deployment/procedure.test.ts` › creates a function that does not exist yet…; updates a function that exists; propagates a lookup error… |
| DEP-10 | **Create or update** with `{ functionId: functionName, parent: projects/<p>/locations/<r>, function: { name, buildConfig: { entryPoint: 'genoacms', runtime, source: { storageSource } }, serviceConfig } }`. `serviceConfig` always carries the instance counts, the ingress and `environmentVariables: { NODE_ENV: 'production' }`, and carries `availableMemory`, `timeoutSeconds` and `serviceAccountEmail` only when set. No update mask. | `deployment/procedure.test.ts` › builds on nodejs22 and runs as the configured service account; `deployment/settings.test.ts` › keeps the service settings… |
| DEP-11 | **Completion.** The procedure awaits the operation. A failed operation throws `deploy/function-failed: <operation error message>`, with the original error as `cause`. | `deployment/procedure.test.ts` › fails when the platform fails to build the function |
| DEP-12 | On success it prints `Function URL: <url>`, taking the function's `url`, else `serviceConfig.uri`, and prints nothing when neither is present. | `deployment/procedure.test.ts` › prints the function URL… |
| DEP-13 | The Functions client uses `credentials` when given, else the operator's ADC. | unverified |

The entry module of DEP-6, byte for byte. The export name is the function's entry point (DEP-10):

```js
import { handler } from './index.js'

/** Cloud Run functions entry point. The name must match buildConfig.entryPoint. */
export function genoacms (req, res) {
  handler(req, res, undefined)
}
```

## S3. SvelteKit adapter (`@genoacms/sveltekit-adapter-cloud-run-functions`)

All `ADP` statements are unverified by tests (GF11).

| # | Statement | Test |
| :-- | :-- | :-- |
| ADP-1 | Options: `out` (default `build`), `precompress` (default `true`), `envPrefix` (default `''`, without effect, GF14). | unverified |
| ADP-2 | `adapt()` empties `out`, writes the client assets to `<out>/client<base>` and prerendered pages to `<out>/prerendered<base>`, and gzip- and brotli-compresses both when `precompress` is set. | unverified |
| ADP-3 | The server is bundled with Rollup into `<out>/server` (ESM, sourcemaps, chunks under `chunks/`), with node resolution under the `node` condition, CommonJS and JSON support. Packages in the `dependencies` of the `package.json` in the working directory, core's, stay external, including deep imports. `<out>/server/manifest.js` exports `manifest`, `prerendered` (the set of prerendered paths) and `base`. | unverified |
| ADP-4 | `<out>/index.js` re-exports `handler` from `<out>/handler.js`. The handler installs SvelteKit's Node polyfills and initializes the server with `env: process.env`, reading assets from `<out>/client<base>`. | unverified |
| ADP-5 | The handler is a middleware chain, in order: static files from `client/`, with `cache-control: public,max-age=31536000,immutable` for `/<appPath>/immutable/` responses with status 200, and serving precompressed `.gz`/`.br` variants; static files from `static/` when present; prerendered pages, redirecting with 308 to the path with the trailing slash added or removed when only that variant is prerendered; then SvelteKit's `respond`. The request URL is built from `X-Forwarded-Proto` (default `http`), then `X-Forwarded-Host`, else `Host`, and the request path. The body is the Functions Framework's `rawBody`. Header arrays are joined with `,`. A URL that cannot be parsed answers `400 Bad Request`. | unverified |
| ADP-6 | `getClientAddress()` returns the raw `X-Forwarded-For` header (GF7). `platform` is `{ req }`, the Node request. | unverified |

## Critique & architectural sanity check: GD1, GD3

**Pros**
- A deploy's exit code now tells the truth, which is the precondition for running `genoa deploy` in CI.
- Operators can size the function and give it its own identity without forking the adapter.
- Every default except the runtime is unchanged, so the change is safe to roll out.

**Cons & trade-offs**
- Deploys block for the whole build. An interrupted CLI leaves the operation running on Google's side, and a deploy started meanwhile may fail with a conflict until it ends.
- Moving the default runtime to `nodejs22` changes the next deploy of every existing instance. That is intended, but it is a behavior change nobody asked for in their config.
- Whole-config updates revert console changes, which surprises an operator who tuned the function by hand.

**Blindspots & missed edge cases**
- **Runtime drift.** `nodejs22` also reaches end of life, and the default will be stale again. The platform refuses a decommissioned runtime at deploy time, which is loud but late.
- **Changing `serviceAccount`** moves every runtime grant to the new account. The first deploy with a new account succeeds, and the instance then fails at runtime until the grants follow. Nothing checks them (GQ2).
- **`minInstances > 0`** bills idle instances. **Ingress `internal`** makes the CMS unreachable from a browser without a load balancer or VPC path. The descriptor cannot know either.
- The client library's default polling timeout bounds how long a build may take before the CLI reports a failure, while the deploy may still succeed on Google's side.
