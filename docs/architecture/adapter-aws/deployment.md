---
type: architecture
title: AWS deployment: Lambda
codes: [LMB]
verified: bbb105f
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
                               (configuration.md D6, D9)         ──▶ Lambda: function, URL, permission
```

At runtime, the Lambda Web Adapter, a layer running as a Lambda extension, starts adapter-node's
server with `run.sh` and turns each invocation into an HTTP request to it on `localhost:8080`.

### Decisions

**WD4. Lambda behind the Lambda Web Adapter and a function URL (WU1; WF15, WF17).** LMB-4, LMB-9 to
LMB-11.
*Why:* adapter-node's server runs unchanged, so the AWS target serves exactly what the Node target
serves, and no wrapper is maintained. A function URL is one resource of the function itself, where
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
it. The client address is the rightmost `X-Forwarded-For` entry.
*Cost:* which headers reach the server through the function URL and the Web Adapter is established
from documentation only (WS2). Behind CloudFront the depth and the host differ, and `origin` must
be set.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| WF15 | **The API Gateway wiring cannot serve the app.** Creating a function reads its ARN from `GetFunctionUrlConfig`, which fails for a function without a URL, so the first deploy stops after `CreateFunction`. Past that: `GetRestApi` is given the function's name where it takes an API ID, so every deploy creates another API; only the resource `/<functionName>` is routed, not `/` or deeper paths; and the invoke permission covers only `GET`. | open |
| WF16 | **The deploy neither waits nor updates the configuration.** `CreateFunction` is not awaited until the function is active before the next steps, and an update sends only `UpdateFunctionCode`, so role, runtime and settings never change after the first deploy, and a failed update is reported as success. | open |
| WF17 | **Retired runtime and wrapper; no URL printed; one archive key.** `nodejs20.x` reached end of support in April 2026. `aws-serverless-express` is deprecated. The deploy prints no URL. Every function's archive goes to `.genoacms/deployment/build.zip`, so two functions deployed from one bucket overwrite each other's archive. | open |
| WF18 | **Dependencies are installed for the operator's platform.** `npm install --omit=dev` runs on the operator's machine, so a native binary is the host's, which Lambda (Linux x64) cannot load. | open |

### History

*History.* The first AWS deploy (2024-05) created a Lambda function behind an API Gateway REST API,
with `aws-serverless-express` as the entry. RFC-0007 moved it to the artifact deploy and made its
settings target options, keeping every step (`configuration.md` P9).

### Verification

- **WS1, for LMB-9: established from the Lambda Web Adapter's README (2026-09-30), not yet by experiment.** The layer is `arn:aws:lambda:<region>:753240598075:layer:LambdaAdapterLayerX86:30` for `x86_64`; it listens on `PORT` (default 8080), is enabled by `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap`, and treats the app as ready when `/` answers a status from 100 to 499. RFC-0026's contract test deploys with it in `eu-central-1`.
- **WS2, for LMB-10: not run.** Request a deployed function through its URL with a forged `X-Forwarded-For: 203.0.113.9`, and observe the headers the server receives. Expected: `host` is the URL's host, `x-forwarded-proto` is `https`, and the rightmost `x-forwarded-for` entry is not `203.0.113.9`. RFC-0026's contract test automates it.
- **WS3, for LMB-9: established from AWS's documentation (2026-09-30).** Since October 2025 a new function URL with `AuthType: NONE` answers anonymous requests only when the resource policy allows both `lambda:InvokeFunctionUrl` (condition `lambda:FunctionUrlAuthType` `NONE`) and `lambda:InvokeFunction` (condition `lambda:InvokedViaFunctionUrl` `true`), each added by its own `AddPermission` call; without them it answers 403. RFC-0026's contract test requests the deployed URL anonymously.

## Specification

### Descriptor (`@genoacms/adapter-aws/deployment`)

#### LMB-1 · Descriptor

Kind `deployment`. It imports no SDK. `svelteKitAdapter()` loads `@sveltejs/adapter-node` lazily, and `svelteKitOptions` maps the build's `outDir` to `{ out: outDir }`. `procedure()` loads the deploy procedure lazily. `credentials` is decoded as JSON.

- Test: unverified (the tests name no statement, WF19)
- Level: unit

#### LMB-2 · Options

Options: `region: string`, `role: string` (the execution role's ARN) and `artifactBucket: string`, all required non-empty (AWS-3); `functionName?: string`, default `genoacms`; `memory?: number`, megabytes, default 1024; `timeoutSeconds?: number`, default 30; `origin?: string`; `credentials?: Secret<AwsCredentials>`, the operator identity, resolved on the operator's machine and never embedded in the build. Any other key is refused (AWS-2), including the former `accountId`.

- Test: none yet
- Level: unit
- State: new (RFC-0026)

#### LMB-3 · Option validation

An invalid present option yields exactly one reason, in this order: `role must be an IAM role ARN` unless it matches `/^arn:aws[a-z-]*:iam::\d{12}:role\/.+$/`; `functionName must be 1 to 64 letters, digits, '-' or '_'`; `memory must be an integer from 128 to 10240`; `timeoutSeconds must be an integer from 1 to 900`; `origin must be an absolute http(s) origin such as 'https://cms.example.com'` unless it matches `/^https?:\/\/[^/\s]+$/`.

- Test: none yet
- Level: unit
- State: new (RFC-0026)

### Deploy procedure

The procedure never reads `process.cwd()`; it works only from the build directory and the work
directory it is given.

#### LMB-4 · Staging

Copy the build directory to `<workDir>/app`. Without `<buildDir>/package.json`, throw `deploy/no-runtime-package: <buildDir>/package.json is missing; build with genoa build`. Write `<workDir>/app/run.sh`, mode `0755`, exactly:

```sh
#!/bin/sh
exec node index.js
```

The copied files, `package.json` included, are not changed.

- Test: none yet
- Level: integration
- State: new (RFC-0026)

#### LMB-5 · Installing dependencies

Run `npm install --omit=dev --no-audit --no-fund --os=linux --cpu=x64` in `<workDir>/app`, as a process without a shell. A non-zero exit throws `deploy/install-failed: <stderr>`.

- Test: none yet
- Level: integration
- State: new (RFC-0026)

#### LMB-6 · Archive

A zip (level 9) of exactly the staged directory, at its root: no globbing, no ignore list. File modes are kept, so `run.sh` stays executable.

- Test: none yet
- Level: integration
- State: new (RFC-0026)

#### LMB-7 · Upload

`PutObject` of the zip to `artifactBucket` under the key `.genoacms/deployment/<functionName>.zip`. An error throws `deploy/upload-failed: <message>`, with the original error as `cause`, and nothing else is called.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### LMB-8 · Lookup

`GetFunction` of `functionName`. The function exists when the call resolves, and is absent only on `ResourceNotFoundException`. Any other error propagates, and neither create nor update is called.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### LMB-9 · Creating

`CreateFunction` with `FunctionName`, `Role: role`, `Runtime: 'nodejs22.x'`, `Architectures: ['x86_64']`, `Handler: 'run.sh'`, `MemorySize: memory`, `Timeout: timeoutSeconds`, `Code: { S3Bucket: artifactBucket, S3Key }` of LMB-7, `Layers: ['arn:aws:lambda:<region>:753240598075:layer:LambdaAdapterLayerX86:30']`, the Lambda Web Adapter (WS1), and `Environment` of LMB-10. The procedure waits until the function is `Active`. It then sends `CreateFunctionUrlConfig` with `AuthType: 'NONE'` and `InvokeMode: 'BUFFERED'`, and two `AddPermission` calls with the principal `*` (WS3): `StatementId: 'FunctionURLAllowPublicAccess'`, `Action: 'lambda:InvokeFunctionUrl'`, `FunctionUrlAuthType: 'NONE'`; and `StatementId: 'FunctionURLInvokeAllowPublicAccess'`, `Action: 'lambda:InvokeFunction'`, `InvokedViaFunctionUrl: true`. `ResourceConflictException` from any of the three, because the URL or the statement already exists, is not an error.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### LMB-10 · Environment

The function's environment variables are exactly: `NODE_ENV=production`, `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap`, `PORT=8080`, `ADDRESS_HEADER=x-forwarded-for`, `XFF_DEPTH=1`, and either `ORIGIN=<origin>` when `origin` is set, or `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=host` when it is not.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### LMB-11 · Updating

`UpdateFunctionCode` with the `S3Bucket` and `S3Key` of LMB-7, then a wait until the update succeeded, then `UpdateFunctionConfiguration` with every setting of LMB-9 except `FunctionName`, `Architectures` and `Code`, then a wait again. The function URL and permission are then ensured as in LMB-9.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### LMB-12 · Completion

A wait that ends with the function `Failed`, or an update `Failed`, throws `deploy/function-failed: <StateReason or LastUpdateStatusReason>`, with the original error as `cause`. The previous code keeps serving after a failed update.

- Test: none yet
- Level: unit
- State: new (RFC-0026)

#### LMB-13 · Function URL

On success the procedure prints `Function URL: <FunctionUrl>`, from the function's URL configuration.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### LMB-14 · Operator credentials

The S3 and Lambda clients use `credentials` when given, else the operator's default credential chain (AWS-4).

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)
