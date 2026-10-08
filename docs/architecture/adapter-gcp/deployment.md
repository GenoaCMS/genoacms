---
type: architecture
title: GCP deployment: Cloud Run functions
codes: [DEP, ADP]
verified: aa17eb9
---

# GCP deployment: Cloud Run functions

Part of the [GCP adapter architecture](README.md). Markers, IDs and test references as defined there.

## Design

### Role

The `gcp` deployment target runs GenoaCMS as one **Cloud Run function (2nd gen)**. Two packages
make that:

- `@genoacms/sveltekit-adapter-cloud-run-functions` shapes the SvelteKit build into something a function can serve (S3);
- `@genoacms/adapter-gcp/deployment` is the target's descriptor and deploy procedure (S1, S2).

```
genoa build gcp                          genoa deploy gcp
  vite build ──SvelteKit adapter──▶ .genoacms/build/   ──procedure──▶ Cloud Functions API
                                    + package.json, vendor/          ──▶ Cloud Build (buildpacks: npm install)
                                    (build.md D6, D9)                ──▶ Cloud Run service
```

The SvelteKit adapter is a fork of `@sveltejs/adapter-node`'s shape for a function, which has no
server of its own to start: the Functions Framework calls an exported handler.

### Decisions

**GD1. The deploy waits for the platform and fails when it fails (GF1, GF2, GF6).** DEP-9 to DEP-12.
*Why:* a deploy that reports success when the platform rejected it is worse than no report, and a
buildpack install failure (`build.md` D9, its *Cost:*) is exactly the case that must surface.
*Cost:* `genoa deploy` takes as long as Cloud Build, a few minutes, instead of returning after the upload.
An interrupted CLI leaves the operation running on Google's side, and a deploy started meanwhile may
fail with a conflict until it ends. The client library's polling timeout bounds how long a build may
take before the CLI reports a failure, while the deploy may still succeed on Google's side.

**GD3. Function settings are target options (GF3, GQ1).** DEP-2 to DEP-4. The runtime default is
`nodejs22`, the oldest Node runtime still in support at the time of writing. Every other default
keeps the adapter's earlier behavior.
*Why:* instance limits, memory and the runtime identity are per-instance operational decisions, not
the adapter's. The service account is the practical fix for GF4, because it lets an operator run the
function as a dedicated, narrowly-granted account (README, IAM).
*Cost:* seven more options to validate and document. A well-formed but unsupported `memory` or
`runtime` value is refused by the platform during the operation, which GD1 reports, not by the
descriptor at build time. The `nodejs22` default changes the next deploy of every existing instance,
and goes stale in turn: the platform refuses a decommissioned runtime at deploy time, loudly but late.
Changing `serviceAccount` moves every runtime grant to the new account; the deploy succeeds and the
instance fails at runtime until the grants follow (GQ2). `minInstances > 0` bills idle instances, and
ingress `internal` makes the CMS unreachable from a browser without a load balancer or VPC path; the
descriptor cannot know either.

**GD5. The adapter honors `ORIGIN` and `XFF_DEPTH`, and the target sets them (GU4; GF7, GF11, GF14).**
RFC-0023. DEP-14, ADP-5, ADP-6, ADP-7.
- `ORIGIN`, when set, is the origin of every request, and forwarded headers no longer decide it. Behind Firebase Hosting or a custom domain the forwarded host can differ from what browsers see, and SvelteKit's CSRF check compares against the request's origin.
- `XFF_DEPTH` says which `X-Forwarded-For` entry, counted from the right, is the client. Default `1`, the entry the platform's own front end appended. Anything to its left was sent by the client and can be forged.
- The `gcp` target sets both through two named options, `origin` and `xffDepth`. It still passes no other environment variable (GQ1).
- The rest of adapter-node's variables are dropped from `env.js`: `BODY_SIZE_LIMIT` is moot because the Functions Framework has already read the body, and the others describe a server this adapter does not start.
- The address and origin logic moves into a module with no build-time placeholders, so it can be unit-tested, and the adapter's test script runs again (GF11).

*Why:* the client address is what sign-in throttling will key on (`contracts/authentication.md` CQ1), and a forgeable one makes throttling useless. The origin fixes CSRF behind proxies that rewrite the host.
*Cost:* two more target options. An operator behind an extra proxy must know its depth, and a wrong depth attributes every request to the proxy, or trusts a forged entry. Only a depth beyond the entries present throws. Depth 1 assumes that Google's front end appends exactly one entry (GS5). Entries are returned as written, so IPv6 forms and ports are not normalized and one client can appear under two spellings. A function reached both directly and through a proxy has no single correct depth.

**GD8. The deploy disables the Functions Framework's ignored routes (GU8; DEP-10; GF20).** The
function's environment carries `IGNORED_ROUTES` set to the empty string.
*Why:* without it, the framework answers `/favicon.ico` and `/robots.txt` with 404 before the
handler runs, so a GenoaCMS instance serves neither, although its handler would. An empty value is
the framework's documented way to filter no route.
*Cost:* every request for those paths now reaches the handler and costs an invocation, as any other
path does. The framework a deployed function runs is the one the buildpack installs, not the one the
end-to-end tests run, since the artifact does not depend on it (GS7).

**The whole configuration is written on every deploy (DEP-10).** No field mask. The config is
therefore the source of truth, and a setting changed in the console is reverted by the next deploy.

**Only the artifact is uploaded (DEP-6, DEP-7).** No project source, no config and no credential
leave the machine (`configuration.md` F9, F15).

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| GF1 | *History.* The deploy returned without awaiting the long-running operation. A buildpack failure was invisible, and `genoa deploy` printed `Code deployed`. | fixed, RFC-0021 |
| GF2 | *History.* The upload's HTTP status was never checked, so a rejected upload continued to `createFunction`. | fixed, RFC-0021 |
| GF3 | *History.* `nodejs20` (end of life April 2026), one instance, ingress `ALLOW_ALL`, and no memory, timeout or service account, all hardcoded. The function ran as the default compute account. | fixed, RFC-0021 |
| GF6 | *History.* Any error from `getFunction` counted as "does not exist" and led to a misleading `createFunction`. | fixed, RFC-0021 |
| GF7 | *History.* **`getClientAddress` returned the whole `X-Forwarded-For` header** (ADP-6). Behind Google's front end it is a comma-separated list whose first entries the client can set. Anything that trusts it as "the client's address", which sign-in throttling would (`contracts/authentication.md` CQ1), must take the entry Google appended, the last one. Q5 decides who reads it. | fixed, RFC-0023 |
| GF11 | *History.* **The SvelteKit adapter's tests were disabled and stale.** Its `test` script only echoes `tests temporarily disabled`, and `tests/smoke.spec.js` imports `create_kit_middleware`, which the handler no longer exports. Every `ADP` statement is unverified by tests. The live deploy exercises them together, not one by one. | fixed: ADP-5 to ADP-7 by RFC-0023, ADP-1 to ADP-4 by RFC-0025 |
| GF14 | *History.* **`env.js` was dead code.** The adapter copies `env.js`, adapter-node's reader for `ORIGIN`, `XFF_DEPTH`, `ADDRESS_HEADER`, `BODY_SIZE_LIMIT` and similar variables, but the handler never imports it. The `envPrefix` option and all those variables have no effect. The origin comes only from forwarded headers (ADP-5). | fixed, RFC-0023 |
| GF17 | *History.* **The deploy procedure has no contract test** against the Cloud Functions API (DEP-8 to DEP-13). Their level includes `contract`; GS2 checks GD1 once, by hand. Until they exist, the results checker fails on every push to `main`, which is therefore not releasable (author, 2026-09-28: the level is kept, not lowered). | fixed, RFC-0025 |
| GF18 | *History.* **The SvelteKit adapter has no end-to-end test** (ADP-1 to ADP-7): no test builds an app with it and serves a request through the result. ADP-5 to ADP-7 are unit-tested only, and GS5 checks the depth by hand. Until they exist, the results checker fails on every push to `main`, which is therefore not releasable (author, 2026-09-28: the level is kept, not lowered). | fixed, RFC-0025 |
| GF20 | **The Functions Framework answers 404 for `/favicon.ico` and `/robots.txt`** before the handler runs, so an instance on the `gcp` target serves neither, although ADP-5's handler would. Found by RFC-0025's end-to-end tests against `@google-cloud/functions-framework` 5 (2026-09-29). Setting `IGNORED_ROUTES` to an empty string disables the filter, per the framework's source (`options.js` and `server.js` of 5.0.5: an empty value filters no route); GD8 sets it. | fixed, RFC-0027 |
| GF23 | **ADP-5 and ADP-2 describe a `static/` directory nothing writes.** SvelteKit copies static files into `client/`, so the handler's middleware for `<out>/static` never serves anything. Found by GS6. The middleware and the clause go. | fixed, RFC-0027 |
| GF26 | **The deploy and SvelteKit adapter tests miss parts of their statements** (GS6). Tests pass when: the upload uses a wrong parent or content type, or a missing `storageSource` does not throw (DEP-8); an update sends an `updateMask`, or unset settings are sent (DEP-10); the original error is dropped as `cause` (DEP-11); the URL fallback or its priority changes (DEP-12); the defaults of `out`, `precompress` and `envPrefix` change (ADP-1); `out` is not emptied, or `base` is dropped (ADP-2); deep imports are bundled, sourcemaps or `chunks/` are dropped (ADP-3); the shims or `env: process.env` are dropped (ADP-4); a 308 loses the query string, `cache-control: immutable` is set on every client file, array headers are joined differently, or an unparsable URL answers 500 (ADP-5); `platform` is empty, or empty `X-Forwarded-For` entries are kept (ADP-6); `<envPrefix>XFF_DEPTH` is not read (ADP-7). | fixed, RFC-0027 |
| GF35 | **A request path starting with `//` replaces the request URL's host** (ADP-5, GS14). The URL is resolved with `new URL(path, origin)`, so `//evil.example/x` with `ORIGIN=https://cms.example.com` becomes `https://evil.example/x`, and `http://evil.example/x` without `ORIGIN`. The Functions Framework passes such a path through unchanged (local run, 5.0.5). SvelteKit's CSRF check compares the `Origin` header with the URL's origin, so a form on `evil.example` posted to `https://cms.example.com//evil.example/<action>` would pass it. Inferred, not run end to end; whether Google's front end normalizes `//` is unknown. Found 2026-10-08 by GS14. | open, RFC-0033 |
| GF36 | **An empty `X-Forwarded-For` returns the socket address** (ADP-6, GS14). A header that is present but empty falls back to the socket's address as if it were absent, while one holding only `,` throws. Both have 0 entries, and ADP-6 lets only a missing header fall back. Found 2026-10-08 by GS14. | open, RFC-0033 |

### History

*History.*
- **Until RFC-0007 (2026-09-27)**, the deploy archived the **project source** from the project root, ignoring only `node_modules`, `.git`, `.github`, `.gitignore`, `.genoacms` and `build`. It injected entry snippets so that GCP would install and build core remotely (`configuration.md` F9, F15). The service-account key inside `genoa.config/` was uploaded with it, and the injected build snippet no longer existed, so the deploy was broken.
- **RFC-0007** replaced that with the artifact upload, and kept the function settings unchanged (its non-goal). That is why GF3 existed.
- **RFC-0021 (2026-09-28)** added GD1 and GD3.
- **RFC-0027 (2026-10-01)** added GD8, so the app serves `/favicon.ico` and `/robots.txt`, and dropped the unused `static/` middleware.
- **The SvelteKit adapter** was written in 2024-11 to adapt SvelteKit to Cloud Run functions instead of using Firebase's adapter.

### Open questions

| # | Question | Recommendation |
| :-- | :-- | :-- |
| GQ1 | Which function settings become options? | Answered by GD3. Concurrency (`maxInstanceRequestConcurrency`, which needs at least one vCPU), CPU and extra environment variables are left out until a use appears. Environment variables in particular would put values into the function's visible configuration, where a secret must never go. |
| GQ2 | Should `genoa deploy` check the runtime identity's grants (README, IAM) before deploying? | No. It would need `testIamPermissions` on every resource the manifest names, with the operator's credentials rather than the runtime's. The grants are documented instead, and a missing one fails loudly at runtime. |

### Verification

- **GS7, for GD8: not run (author, live).** Request `/favicon.ico` and `/robots.txt` from a deployed instance. Expected: the app's own responses, not the framework's empty 404. The end-to-end tests show that the framework honors the empty value, and the deploy contract test that the platform keeps it; only the framework version the buildpack installs is left to this check.
- **GS5, for GD5: not run yet (author, live).** Send a request with a forged `X-Forwarded-For: 203.0.113.9` to the deployed function and log `getClientAddress()`. Expected: the real client address, not `203.0.113.9`. It confirms that depth 1 is right for a function reached directly. It is unverified that Google's front end appends exactly one entry, and behind Firebase Hosting the right depth is expected to be 2.

- Unit tests, with the SDK mocked, cover the `DEP` statements marked below.
- **Established by experiment (RFC-0025, 2026-09-30):** Cloud Run functions adds `LOG_EXECUTION_ID` to every function's environment variables on its own, beside those DEP-10 sends.
- **GS2, for GD1: automated by RFC-0025.** The contract test carrying DEP-11 deploys an artifact that cannot build, on every push to `main`, and checks `deploy/function-failed` and the previous revision; it first passed on 2026-09-30. The manual procedure it replaces: Deploy an artifact whose `package.json` names a dependency that does not exist. Expected: `genoa deploy` exits non-zero with `deploy/function-failed` and the build error, and the previous revision still serves. Then deploy the real artifact. Expected: it exits zero and prints the URL.
- The first live deploy of core (2026-09-28, author) exercised DEP-5 to DEP-10 and ADP-1 to ADP-5 together, before GD1.

## Specification

### Descriptor (`@genoacms/adapter-gcp/deployment`)

#### DEP-1 · Descriptor

Kind `deployment`. It imports no SDK. `svelteKitAdapter()` loads `@genoacms/sveltekit-adapter-cloud-run-functions` lazily, and `svelteKitOptions` maps the build's `outDir` to the adapter's `{ out: outDir }`. `procedure()` loads the deploy procedure lazily. `credentials` is decoded as JSON.

- Test: `packages/adapter-gcp/src/deployment/descriptor.test.ts`
- Level: unit

#### DEP-2 · Options

Options: `projectId: string` and `region: string`, both required non-empty (COM-3); `functionName?: string`, default `genoacms`; `credentials?: Secret<ServiceAccount>`, the operator identity, resolved on the operator's machine and never embedded in the build; and the seven settings of DEP-3. Any other key is refused (COM-2).

- Test: `packages/adapter-gcp/src/deployment/descriptor.test.ts`
- Level: unit

#### DEP-3 · Function settings

Settings, all optional, with defaults and API mapping:
- `runtime`: `/^nodejs\d+$/`, default `nodejs22` → `buildConfig.runtime`
- `memory`: `/^\d+(M|Mi|G|Gi)$/`, platform default → `serviceConfig.availableMemory`
- `timeoutSeconds`: integer 1–3600, platform default → `serviceConfig.timeoutSeconds`
- `minInstances`: integer ≥ 0, default 0 → `serviceConfig.minInstanceCount`
- `maxInstances`: integer ≥ 1, default 1 → `serviceConfig.maxInstanceCount`
- `ingress`: `all` | `internal` | `internal-and-gclb`, default `all` → `serviceConfig.ingressSettings` 1 | 2 | 3
- `serviceAccount`: `/^[^@\s]+@[^@\s]+$/`, default the project's compute account → `serviceConfig.serviceAccountEmail`

- Test: `packages/adapter-gcp/src/deployment/settings.test.ts`
- Level: unit

#### DEP-4 · Setting validation

An invalid present setting yields exactly one reason, in DEP-3's key order: `runtime must be a Node.js runtime such as 'nodejs22'`, `memory must be a size such as '512Mi' or '1Gi'`, `timeoutSeconds must be an integer from 1 to 3600`, `minInstances must be an integer of at least 0`, `maxInstances must be an integer of at least 1`, `ingress must be 'all', 'internal' or 'internal-and-gclb'`, `serviceAccount must be a service account email`. After those, when both instance counts are valid and `minInstances > maxInstances`: `minInstances must not exceed maxInstances`.

- Test: `packages/adapter-gcp/src/deployment/settings.test.ts`
- Level: unit

### Deploy procedure

#### DEP-5 · No working directory

The procedure never reads `process.cwd()`. It works only from the build directory and the work directory it is given.

- Test: `packages/adapter-gcp/src/deployment/procedure.test.ts`
- Level: unit

#### DEP-6 · Staging

**Staging.** Copy the build directory to `<workDir>/app`. Without `<buildDir>/package.json`, throw `deploy/no-runtime-package: <buildDir>/package.json is missing; build with genoa build`. Set `"main": "function.js"` in the copied `package.json`, keeping every other field, and write `function.js` with exactly the entry module below.

- Test: `packages/adapter-gcp/src/deployment/archive.test.ts`
- Level: integration

#### DEP-7 · Archive

**Archive.** A zip (level 9) of exactly the staged directory, at its root: no globbing, no ignore list, no symlink following.

- Test: `packages/adapter-gcp/src/deployment/archive.test.ts`
- Level: integration

#### DEP-8 · Upload

**Upload.** `generateUploadUrl` in `projects/<projectId>/locations/<region>`, then `PUT` the zip to the returned URL with `Content-Type: application/zip`. A response that is not `ok` throws `deploy/upload-failed: <status> <statusText>` and nothing else is called. A response with no URL or no storage source throws `Upload URL not found`.

- Test: `packages/adapter-gcp/src/deployment/procedure.test.ts`, `packages/adapter-gcp/test/contract/deployment.test.ts`
- Level: unit, contract

#### DEP-9 · Lookup

**Lookup.** `getFunction(projects/<p>/locations/<r>/functions/<functionName>)`. It exists when the call resolves, and is absent only on gRPC `NOT_FOUND` (5). Any other error propagates, and neither create nor update is called.

- Test: `packages/adapter-gcp/src/deployment/procedure.test.ts`, `packages/adapter-gcp/test/contract/deployment.test.ts`
- Level: unit, contract

#### DEP-10 · Create or update

**Create or update** with `{ functionId: functionName, parent: projects/<p>/locations/<r>, function: { name, buildConfig: { entryPoint: 'genoacms', runtime, source: { storageSource } }, serviceConfig } }`. `serviceConfig` always carries the instance counts, the ingress and `environmentVariables` holding `NODE_ENV: 'production'` and `IGNORED_ROUTES: ''` (GD8), plus DEP-14's variables when set, and nothing else, and carries `availableMemory`, `timeoutSeconds` and `serviceAccountEmail` only when set. No update mask.

- Test: `packages/adapter-gcp/src/deployment/procedure.test.ts`, `packages/adapter-gcp/src/deployment/settings.test.ts`, `packages/adapter-gcp/test/contract/deployment.test.ts`, `packages/sveltekit-adapter-cloud-run-functions/e2e/adapter.test.js`
- Level: unit, contract, e2e

#### DEP-11 · Completion

**Completion.** The procedure awaits the operation. A failed operation throws `deploy/function-failed: <operation error message>`, with the original error as `cause`.

- Test: `packages/adapter-gcp/src/deployment/procedure.test.ts`, `packages/adapter-gcp/test/contract/deployment.test.ts`
- Level: unit, contract

#### DEP-12 · Function URL

On success it prints `Function URL: <url>`, taking the function's `url`, else `serviceConfig.uri`, and prints nothing when neither is present.

- Test: `packages/adapter-gcp/src/deployment/procedure.test.ts`, `packages/adapter-gcp/test/contract/deployment.test.ts`
- Level: unit, contract

#### DEP-13 · Operator credentials

The Functions client uses `credentials` when given, else the operator's ADC.

- Test: `packages/adapter-gcp/src/deployment/procedure.test.ts`, `packages/adapter-gcp/test/contract/deployment.test.ts`
- Level: unit, contract

#### DEP-14 · Origin and client-address settings

Two more optional settings (GD5). `origin`: an absolute `http` or `https` origin with no path, matching `/^https?:\/\/[^/\s]+$/`, set as the function's `ORIGIN` environment variable. Otherwise `origin must be an absolute http(s) origin such as 'https://cms.example.com'`. `xffDepth`: an integer ≥ 1, set as `XFF_DEPTH` (decimal). Otherwise `xffDepth must be an integer of at least 1`. Unset options set no variable. Their reasons follow DEP-4's, before the instance-order rule.

- Test: `packages/adapter-gcp/src/deployment/settings.test.ts`
- Level: unit

The entry module of DEP-6, byte for byte. The export name is the function's entry point (DEP-10):

```js
import { handler } from './index.js'

/** Cloud Run functions entry point. The name must match buildConfig.entryPoint. */
export function genoacms (req, res) {
  handler(req, res, undefined)
}
```

### SvelteKit adapter (`@genoacms/sveltekit-adapter-cloud-run-functions`)

Tests here are named by file within that package. ADP-1 to ADP-4 and the handler's wiring are not
unit-tested, because `handler.js` imports build-time placeholders (`SERVER`, `MANIFEST`). The
production build, which bundles them, and the live deploy exercise them.

#### ADP-1 · Options

Options: `out` (default `build`), `precompress` (default `true`), `envPrefix` (default `''`), which prefixes the names ADP-7 reads.

- Test: `packages/sveltekit-adapter-cloud-run-functions/e2e/adapter.test.js`
- Level: e2e

#### ADP-2 · Assets

`adapt()` empties `out`, writes the client assets to `<out>/client<base>` and prerendered pages to `<out>/prerendered<base>`, and gzip- and brotli-compresses both when `precompress` is set. It copies `env.js`, `handler.js`, `index.js` and `shims.js` into `out`.

- Test: `packages/sveltekit-adapter-cloud-run-functions/e2e/adapter.test.js`
- Level: e2e

#### ADP-3 · Server bundle

The server is bundled with Rollup into `<out>/server` (ESM, sourcemaps, chunks under `chunks/`), with node resolution under the `node` condition, CommonJS and JSON support. Packages in the `dependencies` of the `package.json` in the working directory, core's, stay external, including deep imports. `<out>/server/manifest.js` exports `manifest`, `prerendered` (the set of prerendered paths) and `base`.

- Test: `packages/sveltekit-adapter-cloud-run-functions/e2e/adapter.test.js`
- Level: e2e

#### ADP-4 · Entry and initialization

`<out>/index.js` re-exports `handler` from `<out>/handler.js`. The handler installs SvelteKit's Node polyfills and initializes the server with `env: process.env`, reading assets from `<out>/client<base>`.

- Test: `packages/sveltekit-adapter-cloud-run-functions/e2e/adapter.test.js`
- Level: e2e

#### ADP-5 · Middleware chain and request URL

The handler is a middleware chain, in order: static files from `client/`, with `cache-control: public,max-age=31536000,immutable` for `/<appPath>/immutable/` responses with status 200, and serving a precompressed `.br` or `.gz` variant when the request's `Accept-Encoding` allows it; prerendered pages, redirecting with 308 to the path with the trailing slash added or removed when only that variant is prerendered; then SvelteKit's `respond`. The request URL is `ORIGIN` plus the request path and query when `ORIGIN` is set (ADP-7). Otherwise it is built from `X-Forwarded-Proto` (default `http`), then `X-Forwarded-Host`, else `Host`, and the request path. In both cases the request path and query are appended to the origin as text: a path that starts with `//`, such as `//evil.example/x`, stays a path on the same host and never names another host. The body is the Functions Framework's `rawBody`. Header arrays are joined with `,`. A URL that cannot be parsed answers `400 Bad Request`.

- Test: `packages/sveltekit-adapter-cloud-run-functions/tests/request.test.js`, `packages/sveltekit-adapter-cloud-run-functions/e2e/adapter.test.js`
- Level: unit, e2e

#### ADP-6 · Client address

`getClientAddress()` splits `X-Forwarded-For` (arrays joined with `,`) on `,`, trims each entry, drops empty ones, and returns the entry `XFF_DEPTH` positions from the right: depth 1 is the last. With fewer entries than the depth it throws `XFF_DEPTH is <depth>, but X-Forwarded-For has <n> entries`. Without the header it returns the socket's remote address. A header that is present but empty, or holds only commas, has 0 entries. `platform` is `{ req }`, the Node request.

- Test: `packages/sveltekit-adapter-cloud-run-functions/tests/request.test.js`, `packages/sveltekit-adapter-cloud-run-functions/e2e/adapter.test.js`
- Level: unit, e2e

#### ADP-7 · Startup environment

At startup the handler reads `<envPrefix>ORIGIN` and `<envPrefix>XFF_DEPTH`. `ORIGIN` is used as given, and unset means none. `XFF_DEPTH` defaults to `1`. A value that is not a positive integer (`/^[1-9]\d*$/`) throws `XFF_DEPTH must be a positive integer, not '<value>'`, so the function fails at start. With a non-empty prefix, any other variable carrying the prefix throws at startup.

- Test: `packages/sveltekit-adapter-cloud-run-functions/tests/request.test.js`, `packages/sveltekit-adapter-cloud-run-functions/e2e/adapter.test.js`
- Level: unit, e2e
