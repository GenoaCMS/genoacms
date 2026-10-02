---
type: architecture
title: AWS deployment: Lambda
codes: [LMB]
verified: 624ce2e
---

# AWS deployment: Lambda

Part of the [AWS adapter architecture](README.md). Markers, IDs and test references as defined there.

## Design

### Role

The `aws` deployment target runs GenoaCMS as one **Lambda function**, reached by its **function
URL** (WU1). `@genoacms/adapter-aws/deployment` is the target's descriptor and deploy procedure.

```
genoa build aws                               genoa deploy aws
  vite build ──adapter-node──▶ .genoacms/build/   ──procedure──▶ npm install (linux x64)
                               + package.json, vendor/           ──▶ zip ──▶ S3 artifact bucket
                               (build.md D6, D9)                 ──▶ Lambda: function, URL, permission
```

At runtime, the Lambda Web Adapter, a layer running as a Lambda extension, starts the staged entry
`genoacms-lambda.js` with `run.sh` and turns each invocation into an HTTP request to it on
`localhost:8080`. The entry serves adapter-node's `handler` (LMB-15).

### Decisions

**WD4. Lambda behind the Lambda Web Adapter and a function URL (WU1; WF15, WF17).** LMB-4, LMB-9 to
LMB-11.
*Why:* adapter-node's handler runs unchanged, so the AWS target serves exactly what the Node target
serves; the only addition is an entry of a few lines that sets the client address (WD7). A function URL is one resource of the function itself, where
API Gateway needed an API, a resource, a method, an integration, a deployment and a stage, and the old
wiring of those never worked (WF15). The layer is maintained by AWS Labs.
*Cost:*
- a function URL has no custom domain; one needs CloudFront in front, which then changes the forwarded headers (WS2);
- the function answers in buffered mode: a response over 6 MB fails, and so does a request body over 6 MB, which bounds the size of a file uploaded through the CMS;
- the public layer is a dependency on AWS Labs' release and on its availability in the region (WS1);
- every cold start starts the whole server, which includes core's startup reads.

**Dependencies are installed for Lambda's platform (WF18; LMB-5).** The procedure installs with
`--os=linux --cpu=x64`, so a package with native binaries gets Lambda's, even on a Mac or an ARM
machine.
*Cost:* a package whose install script compiles for the host still compiles for the host. None of
core's dependencies has one today.

**The whole configuration is written on every deploy (LMB-11)**, as on GCP: a setting changed in the
console is reverted by the next deploy.

**The origin comes from forwarded headers unless `origin` is set (LMB-10).** Adapter-node reads the
protocol and host from the headers the function URL sends, or takes `ORIGIN` when the target sets
it (WS2).
*Cost:* behind CloudFront the host differs, and `origin` must be set.

**WD7. The client address comes from the request context, not `X-Forwarded-For` (WU6; LMB-10,
LMB-15; WF25).** The staged entry copies `http.sourceIp` from the `x-amzn-request-context` header, which
the Web Adapter fills from the invocation's event, into `x-genoacms-client-address`, and
adapter-node's `ADDRESS_HEADER` names that header.
*Why:* a function URL passes the client's `X-Forwarded-For` through unchanged and appends nothing
(WS2), so any entry of it can be forged, and sign-in throttling (`contracts/authentication.md` CQ1) would key
on what the client chose. The event's source address is set by AWS.
*Cost:* the entry replaces adapter-node's `index.js`, so its graceful shutdown, `SHUTDOWN_TIMEOUT`,
`IDLE_TIMEOUT` and socket activation are not used; the Lambda sandbox ends the process itself.
Behind CloudFront, `sourceIp` is CloudFront's address, not the client's. A request without a usable
context has no client address, and adapter-node's `getClientAddress()` then throws; through a
function URL every request carries the Web Adapter's context, and a client's own
`x-amzn-request-context` does not reach the server as sent (LMB-15's contract test).

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| WF15 | **The API Gateway wiring cannot serve the app.** Creating a function reads its ARN from `GetFunctionUrlConfig`, which fails for a function without a URL, so the first deploy stops after `CreateFunction`. Past that: `GetRestApi` is given the function's name where it takes an API ID, so every deploy creates another API; only the resource `/<functionName>` is routed, not `/` or deeper paths; and the invoke permission covers only `GET`. | fixed, RFC-0026 |
| WF16 | **The deploy neither waits nor updates the configuration.** `CreateFunction` is not awaited until the function is active before the next steps, and an update sends only `UpdateFunctionCode`, so role, runtime and settings never change after the first deploy, and a failed update is reported as success. | fixed, RFC-0026 |
| WF17 | **Retired runtime and wrapper; no URL printed; one archive key.** `nodejs20.x` reached end of support in April 2026. `aws-serverless-express` is deprecated. The deploy prints no URL. Every function's archive goes to `.genoacms/deployment/build.zip`, so two functions deployed from one bucket overwrite each other's archive. | fixed, RFC-0026 |
| WF18 | **Dependencies are installed for the operator's platform.** `npm install --omit=dev` runs on the operator's machine, so a native binary is the host's, which Lambda (Linux x64) cannot load. | fixed, RFC-0026 |
| WF20 | **Empty and non-string options passed LMB-3** (WS5). `functionName`, `memory`, `timeoutSeconds` and `origin` set to `""` were accepted: an empty `functionName` named the archive `.genoacms/deployment/.zip`, and an empty `origin` set `ORIGIN=""` without the forwarded headers. A `role` that was not a string got two reasons, where LMB-3 allows one. | fixed, RFC-0026 |
| WF25 | **The client address can be forged** (LMB-10, WS2). With `ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH=1`, RFC-0026's contract test sent `X-Forwarded-For: 203.0.113.9` and the server received exactly `203.0.113.9`: the function URL does not append the client's address, so `getClientAddress()` returned the forged one. | fixed, RFC-0026 |

### History

*History.* The first AWS deploy (2024-05) created a Lambda function behind an API Gateway REST API,
with `aws-serverless-express` as the entry. RFC-0007 moved it to the artifact deploy and made its
settings target options, keeping every step (`configuration.md` P9). RFC-0026 (2026-10-01) rebuilt the deploy on the Lambda Web Adapter and a function URL, with the client address from the request context (WF15 to WF18, WF20, WF25).

### Verification

- **WS1, for LMB-9: established from the Lambda Web Adapter's README (2026-09-30), and confirmed by RFC-0026's contract test (2026-10-01), which deploys with it and requests the app.** The layer is `arn:aws:lambda:<region>:753240598075:layer:LambdaAdapterLayerX86:30` for `x86_64`; it listens on `PORT` (default 8080), is enabled by `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap`, and treats the app as ready when `/` answers a status from 100 to 499. RFC-0026's contract test deploys with it in `eu-central-1`.
- **WS2, for LMB-10: run 2026-10-01 by RFC-0026's contract test, `eu-central-1`.** A deployed function was requested through its URL with a forged `X-Forwarded-For: 203.0.113.9`, and the server echoed the headers it received. `host` was the URL's host and `x-forwarded-proto` `https`, as expected; `x-forwarded-for` was exactly `203.0.113.9`, against the expectation (WF25). The client's real address arrived only as `http.sourceIp` in the JSON header `x-amzn-request-context`. Whether a client can forge that header is checked by LMB-15's contract test.
- **WS3, for LMB-9: established from AWS's documentation (2026-09-30), and confirmed by RFC-0026's contract test (2026-10-01).** Since October 2025 a new function URL with `AuthType: NONE` answers anonymous requests only when the resource policy allows both `lambda:InvokeFunctionUrl` (condition `lambda:FunctionUrlAuthType` `NONE`) and `lambda:InvokeFunction` (condition `lambda:InvokedViaFunctionUrl` `true`), each added by its own `AddPermission` call; without them it answers 403. RFC-0026's contract test requests the deployed URL anonymously.

## Specification

### Descriptor (`@genoacms/adapter-aws/deployment`)

#### LMB-1 · Descriptor

Kind `deployment`. It imports no SDK. `svelteKitAdapter()` loads `@sveltejs/adapter-node` lazily, and `svelteKitOptions` maps the build's `outDir` to `{ out: outDir }`. `procedure()` loads the deploy procedure lazily. `credentials` is decoded as JSON.

- Test: `packages/adapter-aws/src/deployment/descriptor.test.ts`
- Level: unit

#### LMB-2 · Options

Options: `region: string`, `role: string` (the execution role's ARN) and `artifactBucket: string`, all required non-empty (AWS-3); `functionName?: string`, default `genoacms`; `memory?: number`, megabytes, default 1024; `timeoutSeconds?: number`, default 30; `origin?: string`; `credentials?: Secret<AwsCredentials>`, the operator identity, resolved on the operator's machine and never embedded in the build. Any other key is refused (AWS-2), including the former `accountId`.

- Test: `packages/adapter-aws/src/deployment/descriptor.test.ts`, `packages/adapter-aws/src/deployment/procedure.test.ts`
- Level: unit

#### LMB-3 · Option validation

An invalid present option yields exactly one reason, in this order: `role must be an IAM role ARN` unless it matches `/^arn:aws[a-z-]*:iam::\d{12}:role\/.+$/`; `functionName must be 1 to 64 letters, digits, '-' or '_'`; `memory must be an integer from 128 to 10240`; `timeoutSeconds must be an integer from 1 to 900`; `origin must be an absolute http(s) origin such as 'https://cms.example.com'` unless it matches `/^https?:\/\/[^/\s]+$/`.

- Test: `packages/adapter-aws/src/deployment/descriptor.test.ts`
- Level: unit

### Deploy procedure

The procedure never reads `process.cwd()`; it works only from the build directory and the work
directory it is given.

#### LMB-4 · Staging

Copy the build directory to `<workDir>/app`. Without `<buildDir>/package.json`, throw `deploy/no-runtime-package: <buildDir>/package.json is missing; build with genoa build`. Write `<workDir>/app/genoacms-lambda.js`, the entry of LMB-15, replacing a file of that name, and `<workDir>/app/run.sh`, mode `0755`, exactly:

```sh
#!/bin/sh
exec node genoacms-lambda.js
```

The copied files, `package.json` included, are not changed.

- Test: `packages/adapter-aws/src/deployment/stage.test.ts`
- Level: integration

#### LMB-5 · Installing dependencies

Run `npm install --omit=dev --no-audit --no-fund --os=linux --cpu=x64 --libc=glibc` in `<workDir>/app`, as a process without a shell. A non-zero exit throws `deploy/install-failed: <stderr>`.

- Test: `packages/adapter-aws/src/deployment/procedure.test.ts`, `packages/adapter-aws/src/deployment/stage.test.ts`
- Level: integration

#### LMB-6 · Archive

A zip (level 9) of exactly the staged directory, at its root: no globbing, no ignore list. File modes are kept, so `run.sh` stays executable.

- Test: `packages/adapter-aws/src/deployment/stage.test.ts`
- Level: integration

#### LMB-7 · Upload

`PutObject` of the zip to `artifactBucket` under the key `.genoacms/deployment/<functionName>.zip`. An error throws `deploy/upload-failed: <message>`, with the original error as `cause`, and nothing else is called.

- Test: `packages/adapter-aws/src/deployment/procedure.test.ts`, `packages/adapter-aws/test/contract/deployment.test.ts`
- Level: unit, contract

#### LMB-8 · Lookup

`GetFunction` of `functionName`. The function exists when the call resolves, and is absent only on `ResourceNotFoundException`. Any other error propagates, and neither create nor update is called.

- Test: `packages/adapter-aws/src/deployment/procedure.test.ts`, `packages/adapter-aws/test/contract/deployment.test.ts`
- Level: unit, contract

#### LMB-9 · Creating

`CreateFunction` with `FunctionName`, `Role: role`, `Runtime: 'nodejs22.x'`, `Architectures: ['x86_64']`, `Handler: 'run.sh'`, `MemorySize: memory`, `Timeout: timeoutSeconds`, `Code: { S3Bucket: artifactBucket, S3Key }` of LMB-7, `Layers: ['arn:aws:lambda:<region>:753240598075:layer:LambdaAdapterLayerX86:30']`, the Lambda Web Adapter (WS1), and `Environment` of LMB-10. The procedure waits until the function is `Active`. It then sends `CreateFunctionUrlConfig` with `AuthType: 'NONE'` and `InvokeMode: 'BUFFERED'`, and two `AddPermission` calls with the principal `*` (WS3): `StatementId: 'FunctionURLAllowPublicAccess'`, `Action: 'lambda:InvokeFunctionUrl'`, `FunctionUrlAuthType: 'NONE'`; and `StatementId: 'FunctionURLInvokeAllowPublicAccess'`, `Action: 'lambda:InvokeFunction'`, `InvokedViaFunctionUrl: true`. `ResourceConflictException` from any of the three, because the URL or the statement already exists, is not an error.

- Test: `packages/adapter-aws/src/deployment/procedure.test.ts`, `packages/adapter-aws/test/contract/deployment.test.ts`
- Level: unit, contract

#### LMB-10 · Environment

The function's environment variables are exactly: `NODE_ENV=production`, `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap`, `PORT=8080`, `ADDRESS_HEADER=x-genoacms-client-address` (LMB-15), and either `ORIGIN=<origin>` when `origin` is set, or `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=host` when it is not.

- Test: `packages/adapter-aws/src/deployment/procedure.test.ts`, `packages/adapter-aws/test/contract/deployment.test.ts`
- Level: unit, contract

#### LMB-11 · Updating

`UpdateFunctionCode` with the `S3Bucket` and `S3Key` of LMB-7, then a wait until the update succeeded, then `UpdateFunctionConfiguration` with every setting of LMB-9 except `FunctionName`, `Architectures` and `Code`, then a wait again. The function URL and permission are then ensured as in LMB-9.

- Test: `packages/adapter-aws/src/deployment/procedure.test.ts`, `packages/adapter-aws/test/contract/deployment.test.ts`
- Level: unit, contract

#### LMB-12 · Completion

A wait that ends with the function `Failed`, or an update `Failed`, throws `deploy/function-failed: <StateReason or LastUpdateStatusReason>`, with the original error as `cause`. The previous code keeps serving after a failed update.

- Test: `packages/adapter-aws/src/deployment/procedure.test.ts`
- Level: unit

#### LMB-13 · Function URL

On success the procedure prints `Function URL: <FunctionUrl>`, from the function's URL configuration.

- Test: `packages/adapter-aws/src/deployment/procedure.test.ts`, `packages/adapter-aws/test/contract/deployment.test.ts`
- Level: unit, contract

#### LMB-14 · Operator credentials

The S3 and Lambda clients use `credentials` when given, else the operator's default credential chain (AWS-4).

- Test: `packages/adapter-aws/src/deployment/procedure.test.ts`, `packages/adapter-aws/test/contract/deployment.test.ts`
- Level: unit, contract

#### LMB-15 · Entry and client address

`genoacms-lambda.js` is an ES module that imports `handler` from `./handler.js`, adapter-node's, and serves it with `node:http` on `Number(process.env.PORT)`. For each request, before the handler runs, it deletes any `x-genoacms-client-address` header the client sent, in any letter case, and, when the value of `x-amzn-request-context` as Node presents it parses as JSON whose property `http` holds a property `sourceIp` that is a string, the empty string included, sets `x-genoacms-client-address` to that string. Node joins the copies of a repeated header with `, `, so a repeated context sets no address, and neither does an address found in any other property or header, `X-Forwarded-For` included. A request the handler passes on, by calling its third argument, answers 404 with an empty body.

- Test: `packages/adapter-aws/src/deployment/stage.test.ts`, `packages/adapter-aws/test/contract/deployment.test.ts`
- Level: integration, contract
