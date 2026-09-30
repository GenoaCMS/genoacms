---
type: architecture-index
title: AWS adapter architecture
prefix: W
codes: [AWS]
verified: bbb105f
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
package. The code predates the workflow and diverges from the contracts in many places. Each
divergence is a finding, and the Specification states the target: a statement the code does not
meet yet is **New**.

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
| **New** `./secrets`, `./secrets/runtime` | Secrets Manager | [`secrets.md`](secrets.md) |
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
| Runtime | `secretsmanager:GetSecretValue`, `PutSecretValue`, `CreateSecret`, `DeleteSecret` | the account's secrets, or the names core uses (`GENOACMS_*`) | core creates its signing seeds on first start ([`secrets.md`](secrets.md)) |
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
| WF3 | **SDK errors are replaced by messages of the adapter's own** (WD2): `upload-failed`, `delete-failed`, `listing-failed`, `directory-creation-failed`, `document-creation-failed`, `collection-fetching-failed`, `document-fetching-failed`, `document-updating-failed`, `document-deletion-failed`, `unsupported-type`. The cause, its code and its request ID are lost, and a missing table reads the same as a denied permission. | open |
| WF19 | **No test carries a statement ID, and the package publishes its tests.** The unit tests exist (descriptors, storage basics, one DynamoDB round trip, staging, the deploy procedure) but name no statement, so every statement here is unverified. The package has no `files` field and no build, so `src/**/*.test.js` is published. | open |

### Verification

- **The contract tests (WU4)** will run against the author's account, confined to names unique to each run and removed after it, as the GCP ones are (`adapter-gcp/README.md` GU6): objects under `genoacms-contract/<runId>/` in a test bucket, a table and secrets named for the run, and a function `genoacms-contract-<runId>`.
- The opt-in conformance suite (`GENOACMS_TEST_AWS=1`, with `GENOACMS_TEST_AWS_REGION`, `GENOACMS_TEST_AWS_BUCKET`, `GENOACMS_TEST_AWS_TABLE`) runs `@genoacms/conformance`'s storage and database cases against real AWS. It has never run in CI.

### History

*History.* In brief, oldest first:

- **2023-10 to 2024-06** (`0.1` to `0.6.2`): the adapter implemented `@genoacms/cloudabstraction` services on S3 and DynamoDB, as module-level singletons that read the whole config (`configuration.md` F5). The deploy created a Lambda function behind an API Gateway REST API through `aws-serverless-express`.
- **2026-08**: the config shape it read no longer existed, so it could not run (`configuration.md` F14).
- **2026-09-27** (RFC-0007, RFC-0014): ported to descriptors and runtimes and to the artifact deploy, keeping every method body. The port made it load again. It has not been deployed since.

---

### Register

Every `W` ID, where it lives, and its state.

| ID | Summary | State | Document |
| :-- | :-- | :-- | :-- |
| WU1 | One Lambda function, Lambda Web Adapter, function URL | decided | [`deployment.md`](deployment.md) |
| WU2 | One table per collection, prepared by the operator | decided | [`database.md`](database.md) |
| WU3 | Secrets on Secrets Manager | decided | [`secrets.md`](secrets.md) |
| WU4 | `unit` and `contract` levels; scoped IAM user locally, OIDC role in CI | decided | README |
| WD1 | Match the GCP adapter where the contract is silent | new (no RFC yet) | README |
| WD2 | SDK errors propagate unchanged | new (no RFC yet) | README |
| WD3 | Only string keys | new (no RFC yet) | [`database.md`](database.md) |
| WD4 | Lambda behind the Lambda Web Adapter and a function URL | new (no RFC yet) | [`deployment.md`](deployment.md) |
| WD5 | Secrets are deleted without a recovery window | new (no RFC yet) | [`secrets.md`](secrets.md) |
| WF1 | Three storage methods of the contract are missing | open | [`storage.md`](storage.md) |
| WF2 | `getObject` swallows every error | open | [`storage.md`](storage.md) |
| WF3 | SDK errors are replaced by the adapter's own messages | open | README |
| WF4 | Listings differ from the contract's shape | open | [`storage.md`](storage.md) |
| WF5 | Directories are `name/` objects, created after a full read | open | [`storage.md`](storage.md) |
| WF6 | Three storage methods skip the bucket check | open | [`storage.md`](storage.md) |
| WF7 | `ifAbsent` and `ifVersion` together send both conditions | open | [`storage.md`](storage.md) |
| WF8 | `getCollection` reads only the first page | open | [`database.md`](database.md) |
| WF9 | `getDocument` of a missing document throws | open | [`database.md`](database.md) |
| WF10 | `updateDocument` replaces the item, and creates missing ones | open | [`database.md`](database.md) |
| WF11 | `createDocument` can overwrite a document | open | [`database.md`](database.md) |
| WF12 | Snapshots disagree on the key attribute | open | [`database.md`](database.md) |
| WF13 | Numeric keys and non-JSON numbers fail late | open | [`database.md`](database.md) |
| WF14 | No secrets provider | open | [`secrets.md`](secrets.md) |
| WF15 | The API Gateway wiring cannot serve the app | open | [`deployment.md`](deployment.md) |
| WF16 | The deploy neither waits nor updates the configuration | open | [`deployment.md`](deployment.md) |
| WF17 | Retired runtime and wrapper; no URL printed; one archive key | open | [`deployment.md`](deployment.md) |
| WF18 | Dependencies are installed for the operator's platform | open | [`deployment.md`](deployment.md) |
| WF19 | No test carries a statement ID; tests are published | open | README |
| WS1 | The Lambda Web Adapter layer's ARN and version | not run | [`deployment.md`](deployment.md) |
| WS2 | What reaches adapter-node through a function URL | not run | [`deployment.md`](deployment.md) |
| WS3 | The permissions a public function URL needs | not run | [`deployment.md`](deployment.md) |
| WS4 | Secrets Manager's version limit under frequent overwrites | not run | [`secrets.md`](secrets.md) |

---

## Specification

### Shared (`src/shared.js`)

#### AWS-1 · Credentials shape

`AwsCredentials` is `{ accessKeyId: string, secretAccessKey: string, sessionToken?: string }`, the SDK's static credentials. It is passed to the clients unchanged.

- Test: unverified (a type only)
- Level: unit

#### AWS-2 · Unknown options are refused

Every descriptor refuses option keys outside its list, one reason per key: `unknown option '<key>'`.

- Test: unverified (the tests name no statement, WF19)
- Level: unit

#### AWS-3 · Required string options

A required string option that is missing, not a string or empty yields `<key> is required and must be a non-empty string`. `region` is required by every descriptor.

- Test: unverified (the tests name no statement, WF19)
- Level: unit

#### AWS-4 · One client per provider, the default chain by default

Each provider construction creates its own client with `{ region }`, plus `credentials` only when given. Otherwise the SDK's default credential provider chain applies. Two providers on one AWS service share neither client nor credential, so two regions or two accounts can be served at once.

- Test: unverified (the tests name no statement, WF19)
- Level: unit
