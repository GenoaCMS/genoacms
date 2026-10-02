---
type: architecture-index
title: AWS adapter architecture
prefix: W
codes: [AWS]
verified: 624ce2e
---

# AWS adapter architecture

## Design

### Overview

Everything GenoaCMS runs on Amazon Web Services: storage, database, secrets, deployment, the runtime
and operator identities, and IAM. RFCs for `@genoacms/adapter-aws` are derived from these documents.
They follow the Spec Workflow ([`docs/WORKFLOW.md`](../../WORKFLOW.md)). The ID prefix is `W`.

**Test references** name test files by path from the repository root, and each test carries the IDs of
the statements it checks in its title (`WORKFLOW.md` §6.2). `packages/adapter-aws/test/conformance.test.js`
runs `@genoacms/conformance` against real AWS, only with `GENOACMS_TEST_AWS=1`.

**Relation to [`configuration.md`](../configuration.md)** is the one the GCP adapter has
([`adapter-gcp/README.md`](../adapter-gcp/README.md)): that document defines the adapter model and
stays authoritative for it; these documents cover only what is specific to AWS.

**Relation to the GCP adapter.** Both implement the same contracts for the same core. Where a
contract leaves behavior open, the AWS adapter behaves as the GCP adapter does, unless a decision
here says otherwise (WD1).

**Written from the code at `bbb105f`** (2026-09-30), the first architecture document of this
package. The code predated the workflow and diverged from the contracts in many places; each
divergence was a finding, and RFC-0026 brought the code to the Specification.

### Documents

| Document | Codes | Covers |
| :-- | :-- | :-- |
| this README | AWS | the package, the identities, IAM, verification, the register of every `W` ID |
| [`storage.md`](storage.md) | OBJ | S3 |
| [`database.md`](database.md) | DDB | DynamoDB |
| [`secrets.md`](secrets.md) | ASM | Secrets Manager |
| [`deployment.md`](deployment.md) | LMB | Lambda, its function URL, the deploy procedure |

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| WU1 | 2026-09-30: GenoaCMS runs on AWS as **one Lambda function** serving adapter-node's server through the **Lambda Web Adapter**, reached by a **function URL**. API Gateway and `aws-serverless-express` are dropped. | [`deployment.md`](deployment.md) WD4 |
| WU2 | 2026-09-30: **one DynamoDB table per collection**, prepared by the operator with its key. Collections are never created at runtime: they are defined in the config or by the operator (`.genoacms/collections`), never by a CMS user. | [`database.md`](database.md) |
| WU3 | 2026-09-30: a secrets provider on **Secrets Manager**. | [`secrets.md`](secrets.md) |
| WU4 | 2026-09-30: every runtime statement is verified at `unit` and `contract`. The contract tests run against the author's AWS account: locally with a scoped IAM user (`genoacms-contract`), and in CI through GitHub's OIDC provider and a role, never an access key. The root user is never used. | Verification |
| WU5 | 2026-10-01: a secret **scheduled for deletion is absent**: reading it resolves `undefined` and deleting it again `false`, and a delete does not wait for Secrets Manager to finish (WF24). It replaced the same day's decision to wait in the delete, once the delete was seen to take up to 30 seconds (WS6). | [`secrets.md`](secrets.md) WD6 |
| WU6 | 2026-10-01: the client address is taken from **`http.sourceIp` of the request context** through a small staged entry, not from `X-Forwarded-For`, which a function URL passes through unchanged (WF25). | [`deployment.md`](deployment.md) WD7 |

**WD1. The AWS adapter matches the GCP adapter where the contract is silent.** Directory
placeholders, listing shapes, error propagation and the messages of GenoaCMS's own errors are the
GCP adapter's. Where AWS differs in a way core can see (a missing object, the order of a
collection), the statement says so.
*Why:* core is written and tested against one behavior. Two adapters that differ where the contract
is silent make core's behavior depend on the platform, and only one of them is exercised in practice.
*Cost:* the AWS adapter inherits the GCP adapter's choices, including ones S3 would allow to be
simpler, such as the `.folderPlaceholder` object instead of S3's usual `name/` convention.

**WD2. SDK errors propagate unchanged.** No method replaces an AWS SDK error with a message of its
own. GenoaCMS's own errors (`PreconditionFailedError`, `bucket-unregistered`, `database/…`,
`deploy/…`) are raised only where a statement names them.
*Why:* WF3. A replaced error loses the service's code and the request ID an operator needs.
*Cost:* core and operators see AWS's error names (`NoSuchKey`, `ResourceNotFoundException`), which
differ from Google's.

### The package

`@genoacms/adapter-aws` implements four GenoaCMS services on AWS. Each is a descriptor, which the build
loads and which imports no SDK, and a runtime, which the host constructs per provider
(`configuration.md` D2, D3).

| Export | AWS service | Document |
| :-- | :-- | :-- |
| `./storage`, `./storage/runtime` | S3 | [`storage.md`](storage.md) |
| `./database`, `./database/runtime` | DynamoDB | [`database.md`](database.md) |
| `./secrets`, `./secrets/runtime` | Secrets Manager | [`secrets.md`](secrets.md) |
| `./deployment` (descriptor and procedure; no runtime) | Lambda | [`deployment.md`](deployment.md) |

What every service shares is specified once, in AWS-1 to AWS-4 at the end of this README.

---

### Identities

- **The runtime identity** is the Lambda function's execution role, the `aws` target's `role` option. Every runtime client omits `credentials` in production and uses the SDK's default credential provider chain, which on Lambda yields the role's temporary credentials, so no credential ships with the build (`configuration.md` goal 5).
- **The operator identity** is whoever runs `genoa deploy`: the target's `credentials`, resolved on the operator's machine and never embedded in the build, or the operator's own default chain (a profile, SSO, environment variables).

`credentials` on runtime descriptors exists for running outside AWS, for example a development config.

---

### IAM

What each identity needs.

| Identity | Needs | On | Why |
| :-- | :-- | :-- | :-- |
| Runtime | `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` | every configured bucket and its objects | [`storage.md`](storage.md); a move is a copy (get and put) and a delete |
| Runtime | `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Scan` | every collection's table | [`database.md`](database.md) |
| Runtime | `secretsmanager:GetSecretValue`, `DescribeSecret`, `PutSecretValue`, `CreateSecret`, `DeleteSecret` | the account's secrets, or the names core uses (`GENOACMS_*`) | core creates its signing seeds on first start ([`secrets.md`](secrets.md)) |
| Runtime | `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` | the function's log group | Lambda's logging; the managed policy `AWSLambdaBasicExecutionRole` |
| Operator | `lambda:GetFunction`, `CreateFunction`, `UpdateFunctionCode`, `UpdateFunctionConfiguration`, `GetFunctionUrlConfig`, `CreateFunctionUrlConfig`, `AddPermission` | the function | [`deployment.md`](deployment.md) |
| Operator | `lambda:GetLayerVersion` | the Lambda Web Adapter layer | the function uses it (WS1) |
| Operator | `iam:PassRole` | the execution role | a function can only be given a role its deployer may pass |
| Operator | `s3:PutObject` | the artifact bucket, `.genoacms/deployment/*` | LMB-7 |

A missing runtime grant fails loudly at runtime with AWS's `AccessDenied` error. `genoa deploy` does
not check grants, as on GCP (`adapter-gcp/deployment.md` GQ2).

---

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| WF3 | **SDK errors are replaced by messages of the adapter's own** (WD2): `upload-failed`, `delete-failed`, `listing-failed`, `directory-creation-failed`, `document-creation-failed`, `collection-fetching-failed`, `document-fetching-failed`, `document-updating-failed`, `document-deletion-failed`, `unsupported-type`. The cause, its code and its request ID are lost, and a missing table reads the same as a denied permission. | fixed, RFC-0026 |
| WF19 | **No test carries a statement ID, and the package publishes its tests.** The unit tests exist (descriptors, storage basics, one DynamoDB round trip, staging, the deploy procedure) but name no statement, so every statement here is unverified. The package has no `files` field and no build, so `src/**/*.test.js` is published. | fixed, RFC-0026 |
| WF23 | **The RFC-0026 tests miss parts of their statements** (WS5). Tests pass when, among others: a directory move skips placeholders or the object named exactly `name` (OBJ-11); `setSecret` goes on after an error other than the ones ASM-4 names, or swallows the last put's error (ASM-4); a failed claim writes anyway (ASM-5); `deleteSecret` or `deleteDocument` swallows errors (ASM-6, DDB-7); the URL and permission steps swallow errors other than `ResourceConflictException` (LMB-9); `memory`, `timeoutSeconds`, `functionName` or `artifactBucket` are ignored (LMB-2); the role, name and origin patterns are loosened (LMB-3); the zip drops dotfiles or uses another level (LMB-6); the database and secrets clients ignore region or credentials (AWS-4); a listing normalizes `name` (OBJ-8); a directory is read before its placeholder is written (OBJ-9). WS5 lists every surviving mutation. | fixed, RFC-0026 |
| WF26 | **The amendment's tests miss parts of LMB-15 and ASM-3** (WS7). They pass when the entry falls back to `X-Forwarded-For` without a usable context, takes the first copy of a repeated context, refuses an empty `sourceIp`, or reads the address from a property other than `http`; and when ASM-3 counts only a past `DeletedDate` as scheduled. | fixed, RFC-0026 |

### Verification

- **The contract tests (WU4)** will run against the author's account, confined to names unique to each run and removed after it, as the GCP ones are (`adapter-gcp/README.md` GU6): objects under `genoacms-contract/<runId>/` in a test bucket, a table and secrets named for the run, and a function `genoacms-contract-<runId>`.
- **WS5, falsification audit of RFC-0026's statements (WORKFLOW §6.3), at `34ef76f`, 2026-09-30.** An agent that wrote neither the code nor the tests (Sonnet 5) made about 270 mutations of the code while the unit and integration tests ran; it reasoned about the contract tests without running them. AWS-3, OBJ-1, OBJ-4, DDB-1, DDB-5, DDB-6, ASM-1, LMB-4, LMB-5 and LMB-10 held. The counterexamples are WF20 to WF22 (defects) and WF23 (tests that miss parts of their statements). Clauses nothing can observe: DDB-5's order, and OBJ-5's expiry with the role's session.
- **WS7, falsification audit of the statements RFC-0026's amendment changed (ASM-3, ASM-6, LMB-4, LMB-10, LMB-15), at `e307fcc`, 2026-10-01.** An agent that wrote neither the code nor the tests made 35 mutations; 29 failed a test. The 6 that passed are WF26, except one: binding the entry to `127.0.0.1` violated the clause "on all interfaces", which the Web Adapter, connecting over loopback, does not observe, so the clause was removed. It found no defect, and three readings the statements left open: a `DescribeSecret` error in ASM-6, a repeated context header and the consequence of a missing context in LMB-15; the statements and WD7 now settle them.
- The opt-in conformance suite (`GENOACMS_TEST_AWS=1`, with `GENOACMS_TEST_AWS_REGION`, `GENOACMS_TEST_AWS_BUCKET`, `GENOACMS_TEST_AWS_TABLE`) runs `@genoacms/conformance`'s storage and database cases against real AWS. It has never run in CI.

### History

*History.* In brief, oldest first:

- **2023-10 to 2024-06** (`0.1` to `0.6.2`): the adapter implemented `@genoacms/cloudabstraction` services on S3 and DynamoDB, as module-level singletons that read the whole config (`configuration.md` F5). The deploy created a Lambda function behind an API Gateway REST API through `aws-serverless-express`.
- **2026-08**: the config shape it read no longer existed, so it could not run (`configuration.md` F14).
- **2026-09-27** (RFC-0007, RFC-0014): ported to descriptors and runtimes and to the artifact deploy, keeping every method body. The port made it load again. It has not been deployed since.
- **2026-10-01** (RFC-0026): TypeScript, built to `dist/`; every service brought to the Specification, a Secrets Manager provider added, the deploy rebuilt on the Lambda Web Adapter and a function URL, and tests at `unit`, `integration` and `contract` against a real account (WF1 to WF26).

---

### Register

Every `W` ID, where it lives, and its state.

| ID | Summary | State | Document |
| :-- | :-- | :-- | :-- |
| WU1 | One Lambda function, Lambda Web Adapter, function URL | decided | [`deployment.md`](deployment.md) |
| WU2 | One table per collection, prepared by the operator | decided | [`database.md`](database.md) |
| WU3 | Secrets on Secrets Manager | decided | [`secrets.md`](secrets.md) |
| WU4 | `unit` and `contract` levels; scoped IAM user locally, OIDC role in CI | decided | README |
| WU5 | A secret scheduled for deletion is absent | decided | [`secrets.md`](secrets.md) |
| WU6 | The client address from the request context | decided | [`deployment.md`](deployment.md) |
| WD1 | Match the GCP adapter where the contract is silent | current, RFC-0026 | README |
| WD2 | SDK errors propagate unchanged | current, RFC-0026 | README |
| WD3 | Only string keys | current, RFC-0026 | [`database.md`](database.md) |
| WD4 | Lambda behind the Lambda Web Adapter and a function URL | current, RFC-0026 | [`deployment.md`](deployment.md) |
| WD5 | Secrets are deleted without a recovery window | current, RFC-0026 | [`secrets.md`](secrets.md) |
| WD6 | A secret scheduled for deletion is absent | current, RFC-0026 | [`secrets.md`](secrets.md) |
| WD7 | The client address comes from the request context | current, RFC-0026 | [`deployment.md`](deployment.md) |
| WF1 | Three storage methods of the contract are missing | fixed, RFC-0026 | [`storage.md`](storage.md) |
| WF2 | `getObject` swallows every error | fixed, RFC-0026 | [`storage.md`](storage.md) |
| WF3 | SDK errors are replaced by the adapter's own messages | fixed, RFC-0026 | README |
| WF4 | Listings differ from the contract's shape | fixed, RFC-0026 | [`storage.md`](storage.md) |
| WF5 | Directories are `name/` objects, created after a full read | fixed, RFC-0026 | [`storage.md`](storage.md) |
| WF6 | Three storage methods skip the bucket check | fixed, RFC-0026 | [`storage.md`](storage.md) |
| WF7 | `ifAbsent` and `ifVersion` together send both conditions | fixed, RFC-0026 | [`storage.md`](storage.md) |
| WF8 | `getCollection` reads only the first page | fixed, RFC-0026 | [`database.md`](database.md) |
| WF9 | `getDocument` of a missing document throws | fixed, RFC-0026 | [`database.md`](database.md) |
| WF10 | `updateDocument` replaces the item, and creates missing ones | fixed, RFC-0026 | [`database.md`](database.md) |
| WF11 | `createDocument` can overwrite a document | fixed, RFC-0026 | [`database.md`](database.md) |
| WF12 | Snapshots disagree on the key attribute | fixed, RFC-0026 | [`database.md`](database.md) |
| WF13 | Numeric keys and non-JSON numbers fail late | fixed, RFC-0026 | [`database.md`](database.md) |
| WF14 | No secrets provider | fixed, RFC-0026 | [`secrets.md`](secrets.md) |
| WF15 | The API Gateway wiring cannot serve the app | fixed, RFC-0026 | [`deployment.md`](deployment.md) |
| WF16 | The deploy neither waits nor updates the configuration | fixed, RFC-0026 | [`deployment.md`](deployment.md) |
| WF17 | Retired runtime and wrapper; no URL printed; one archive key | fixed, RFC-0026 | [`deployment.md`](deployment.md) |
| WF18 | Dependencies are installed for the operator's platform | fixed, RFC-0026 | [`deployment.md`](deployment.md) |
| WF19 | No test carries a statement ID; tests are published | fixed, RFC-0026 | README |
| WF20 | Empty and non-string deploy options passed validation | fixed, RFC-0026 | [`deployment.md`](deployment.md) |
| WF21 | An empty update succeeded on a missing document | fixed, RFC-0026 | [`database.md`](database.md) |
| WF22 | A key field with an unsupported value failed a create | fixed, RFC-0026 | [`database.md`](database.md) |
| WF23 | The RFC-0026 tests miss parts of their statements | fixed, RFC-0026 | README |
| WF24 | A deleted secret is not gone at once; deleting a missing one succeeds | fixed, RFC-0026 | [`secrets.md`](secrets.md) |
| WF25 | The client address can be forged behind a function URL | fixed, RFC-0026 | [`deployment.md`](deployment.md) |
| WF26 | The amendment's tests miss parts of LMB-15 and ASM-3 | fixed, RFC-0026 | README |
| WF27 | Deleting a secret just deleted can resolve `true` | fixed, RFC-0029 | [`secrets.md`](secrets.md) |
| WS1 | The Lambda Web Adapter layer's ARN and version | automated, RFC-0026 | [`deployment.md`](deployment.md) |
| WS2 | What reaches adapter-node through a function URL | automated, RFC-0026; finding WF25 | [`deployment.md`](deployment.md) |
| WS3 | The permissions a public function URL needs | automated, RFC-0026 | [`deployment.md`](deployment.md) |
| WS4 | Secrets Manager's version limit under frequent overwrites | not run | [`secrets.md`](secrets.md) |
| WS5 | Falsification audit of RFC-0026's statements | run at `34ef76f`; findings WF20 to WF23 | README |
| WS7 | Falsification audit of RFC-0026's amended statements | run at `e307fcc`; finding WF26 | README |
| WS6 | How a forced secret delete completes | run 2026-10-01; finding WF24 | [`secrets.md`](secrets.md) |
| WS8 | Whether a forced delete can be read as live again | run 2026-10-02; finding WF27 | [`secrets.md`](secrets.md) |

---

## Specification

### Shared (`src/shared.js`)

#### AWS-1 · Credentials shape

`AwsCredentials` is `{ accessKeyId: string, secretAccessKey: string, sessionToken?: string }`, the SDK's static credentials. It is passed to the clients unchanged.

- Test: unverified (a type only)
- Level: unit

#### AWS-2 · Unknown options are refused

Every descriptor refuses option keys outside its list, one reason per key: `unknown option '<key>'`.

- Test: `packages/adapter-aws/src/database/descriptor.test.ts`, `packages/adapter-aws/src/deployment/descriptor.test.ts`, `packages/adapter-aws/src/secrets/descriptor.test.ts`, `packages/adapter-aws/src/storage/descriptor.test.ts`
- Level: unit

#### AWS-3 · Required string options

A required string option that is missing, not a string or empty yields `<key> is required and must be a non-empty string`. `region` is required by every descriptor.

- Test: `packages/adapter-aws/src/database/descriptor.test.ts`, `packages/adapter-aws/src/deployment/descriptor.test.ts`, `packages/adapter-aws/src/secrets/descriptor.test.ts`, `packages/adapter-aws/src/storage/descriptor.test.ts`
- Level: unit

#### AWS-4 · One client per provider, the default chain by default

Each provider construction creates its own client with `{ region }`, plus `credentials` only when given. Otherwise the SDK's default credential provider chain applies. Two providers on one AWS service share neither client nor credential, so two regions or two accounts can be served at once.

- Test: `packages/adapter-aws/src/database/runtime.test.ts`, `packages/adapter-aws/src/secrets/runtime.test.ts`, `packages/adapter-aws/src/storage/runtime.test.ts`
- Level: unit
