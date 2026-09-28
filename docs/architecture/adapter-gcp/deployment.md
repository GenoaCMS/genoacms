# GCP deployment: Cloud Run functions

Part of the [GCP adapter architecture](README.md). Markers and IDs as defined there.

## 1. Overview

The `gcp` deployment target runs GenoaCMS as one **Cloud Run function (2nd gen)**. Two packages
make that:

- `@genoacms/sveltekit-adapter-cloud-run-functions` shapes the SvelteKit build into something a function can serve (§3);
- `@genoacms/adapter-gcp/deployment` is the target's descriptor and deploy procedure (§2, §4).

```
genoa build gcp                          genoa deploy gcp
  vite build ──SvelteKit adapter──▶ .genoacms/build/   ──procedure──▶ Cloud Functions API
                                    + package.json, vendor/          ──▶ Cloud Build (buildpacks: npm install)
                                    (configuration.md D6, D9)        ──▶ Cloud Run service
```

## 2. The descriptor

`@genoacms/adapter-gcp/deployment` imports no SDK. The build loads it to choose the SvelteKit adapter,
and the CLI loads the procedure only on `genoa deploy` (`configuration.md` §5.4).

Options:

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `projectId` | string | required | GCP project |
| `region` | string | required | Cloud Functions region, for example `europe-west3` |
| `functionName` | string | `genoacms` | function ID |
| `credentials` | `Secret<ServiceAccount>` | operator's ADC | the operator identity (README §3). Resolved on the operator's machine and never embedded in the build. |

The function's settings (GD3, RFC-0021), all optional:

| Option | Type | Default | Maps to |
| :-- | :-- | :-- | :-- |
| `runtime` | string | `nodejs22` | `buildConfig.runtime` |
| `memory` | string, for example `512Mi` | platform default | `serviceConfig.availableMemory` |
| `timeoutSeconds` | integer, 1 to 3600 | platform default | `serviceConfig.timeoutSeconds` |
| `minInstances` | integer ≥ 0 | `0` | `serviceConfig.minInstanceCount` |
| `maxInstances` | integer ≥ 1 | `1` | `serviceConfig.maxInstanceCount` |
| `ingress` | `'all'` \| `'internal'` \| `'internal-and-gclb'` | `'all'` | `serviceConfig.ingressSettings` |
| `serviceAccount` | email | project's default compute account | `serviceConfig.serviceAccountEmail`: the runtime identity (README §3, fixes GF4 in practice) |

## 3. The SvelteKit adapter

`@genoacms/sveltekit-adapter-cloud-run-functions` is a fork of `@sveltejs/adapter-node`'s shape for a
function that has no server of its own to start:

- `adapt()` writes the client assets and prerendered pages, and bundles the server with Rollup. Packages in core's `dependencies` stay external, and `configuration.md` §7.1 lists them in the artifact's `package.json`. It then copies `files/`: `index.js` (re-exports `handler`), `handler.js`, `env.js` and `shims.js`.
- `handler.js` exports one middleware chain: static client assets (immutable caching under `_app/immutable`), `static/`, prerendered pages, then SvelteKit's `server.respond`. It builds a `Request` from the Node request, taking the protocol and host from `X-Forwarded-Proto`/`X-Forwarded-Host`, and the body from `rawBody`, which the Functions Framework has already read.
- `files/` is built by `rollup -c` and is gitignored, so a fresh checkout must build this package before a GCP build (`configuration.md` F17). Published packages include it through `prepublishOnly`, and vendoring (`configuration.md` D9) refuses the package if `files/` is missing.

**GF7 (open).** `getClientAddress` returns the whole `X-Forwarded-For` header. Behind Google's front
end it is a comma-separated list whose first entries the client can set. Anything that trusts it as
"the client's address", which sign-in throttling would (`configuration.md` Q5), must take the entry
Google appended, the last one, rather than the header. Not fixed here: Q5 decides who reads it.

## 4. The deploy procedure

### 4.1 Steps

`genoa deploy gcp` (`src/deployment/procedure.ts`):

1. **Stage**: copy the artifact to `<workDir>/app`, add `function.js`, which exports `genoacms(req, res)` calling the adapter's `handler`, and set `"main": "function.js"`. Without the artifact's `package.json` it stops with `deploy/no-runtime-package`.
2. **Zip** exactly that directory: no globbing, no ignore list.
3. **Upload** to a signed URL from `generateUploadUrl`. A response that is not `ok` stops the deploy with `deploy/upload-failed: <status> <statusText>`.
4. **Create or update** the function. Only gRPC `NOT_FOUND` from `getFunction` means create, and any other lookup error propagates. The request carries the whole configuration: `entryPoint: 'genoacms'`, the settings from §2 mapped by `settings.ts`, and `NODE_ENV=production`. There is no field mask, so the config is the source of truth and a setting changed in the console is reverted by the next deploy.
5. **Wait** for the operation, which includes Cloud Build: buildpacks run `npm install` on the uploaded `package.json` (`configuration.md` R4), with `@genoacms/*` from the zip's `vendor/` (`configuration.md` D9). A failed operation throws `deploy/function-failed: <message>`, and the previous revision keeps serving. On success the procedure prints `Function URL: <url>`.

### 4.2 Decisions

**GD1. The deploy waits for the platform and fails when it fails (GF1, GF2, GF6).** Steps 3 to 5 above.
*Why:* a deploy that reports success when the platform rejected it is worse than no report, and a
buildpack install failure (`configuration.md` D9 critique) is exactly the case that must surface.
*Cost:* `genoa deploy` takes as long as Cloud Build, a few minutes, instead of returning after the upload.

**GD3. Function settings are target options (GF3, GQ1).** §2's second table. The runtime default is
`nodejs22`, the oldest Node runtime still in support at the time of writing. Every other default
keeps the adapter's earlier behavior.
*Why:* instance limits, memory and the runtime identity are per-instance operational decisions, not
the adapter's. The service account is the practical fix for GF4, because it lets an operator run the
function as a dedicated, narrowly-granted account (README §4).
*Cost:* seven more options to validate and document. A well-formed but unsupported `memory` or
`runtime` string is refused by the platform during the operation, which GD1 reports, not by the
descriptor at build time.

### 4.3 Fixed findings

| # | Finding | Fixed by |
| :-- | :-- | :-- |
| GF1 | *History.* The deploy returned without awaiting the long-running operation. A buildpack failure was invisible, and `genoa deploy` printed `Code deployed`. | GD1, RFC-0021 |
| GF2 | *History.* The upload's HTTP status was never checked, so a rejected upload continued to `createFunction`. | GD1, RFC-0021 |
| GF3 | *History.* `nodejs20` (end of life April 2026), one instance, ingress `ALLOW_ALL`, and no memory, timeout or service account, all hardcoded. The function ran as the default compute account. | GD3, RFC-0021 |
| GF6 | *History.* Any error from `getFunction` counted as "does not exist" and led to a misleading `createFunction`. | GD1, RFC-0021 |

### 4.4 History

*History.* Until RFC-0007 (2026-09-27), the deploy archived the **project source** from the project
root, ignoring only `node_modules`, `.git`, `.github`, `.gitignore`, `.genoacms` and `build`, and
injected entry snippets so that GCP would install and build core remotely (`configuration.md` F9,
F15). The service-account key inside `genoa.config/` was uploaded with it, and the injected build
snippet no longer existed, so the deploy was broken. RFC-0007 replaced that with the artifact upload
in §4.1, and kept the function settings unchanged (RFC-0007 non-goal), which is why GF3 existed until RFC-0021.

## 5. Open questions

| # | Question | Recommendation |
| :-- | :-- | :-- |
| GQ1 | Which function settings become options? | Answered by GD3. Concurrency (`maxInstanceRequestConcurrency`, which needs at least one vCPU), CPU and extra environment variables are left out until a use appears. Environment variables in particular would put values into the function's visible configuration, where a secret must never go. |
| GQ2 | Should `genoa deploy` check the runtime identity's grants (README §4) before deploying? | No. It would need `testIamPermissions` on every resource the manifest names, with the operator's credentials rather than the runtime's. The grants are documented instead, and a missing one fails loudly at runtime. |

## 6. Verification

**GS2, for GD1: not run yet (author, live).** Deploy an artifact whose `package.json` names a
dependency that does not exist. Expected: `genoa deploy` exits non-zero with
`deploy/function-failed` and the build error, and the previous revision still serves. Then deploy the
real artifact. Expected: it exits zero and prints the URL.

Unit tests (RFC-0021, passing) cover the upload status, `NOT_FOUND` against other errors, a failed operation,
and the mapping of every GD3 option, all with the SDK mocked.

## Critique & architectural sanity check: GD1, GD3

**Pros**
- A deploy's exit code now tells the truth, which is the precondition for running `genoa deploy` in CI.
- Operators can size the function and give it its own identity without forking the adapter.
- Every default except the runtime is unchanged, so the change is safe to roll out.

**Cons & trade-offs**
- Deploys block for the whole build. An interrupted CLI leaves the operation running on Google's side, and a deploy started meanwhile may fail with a conflict until it ends.
- Moving the default runtime to `nodejs22` changes the next deploy of every existing instance. That is intended, but it is a behavior change nobody asked for in their config.
- Whole-config updates revert console changes. That is the consistent choice, but it surprises an operator who tuned the function by hand.

**Blindspots & missed edge cases**
- **Runtime drift.** `nodejs22` also goes end of life, and the default will be stale again. Nothing warns when the configured runtime is deprecated. The platform refuses a decommissioned runtime at deploy time, which is loud but late.
- **Changing `serviceAccount`** moves every runtime grant to the new account. The first deploy with a new account succeeds and the instance then fails at runtime until the grants follow. §4 of the README lists them, but nothing checks them (GQ2).
- **`minInstances > 0`** bills idle instances. It is the operator's choice, but the option sits next to harmless ones.
- **Ingress `internal`** makes the CMS unreachable from a browser unless a load balancer or VPC path exists. The descriptor cannot know.
