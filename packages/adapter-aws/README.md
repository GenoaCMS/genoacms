# `@genoacms/adapter-aws`

GenoaCMS on Amazon Web Services: S3 storage, DynamoDB database, Secrets Manager, and a deployment target that runs the CMS as one Lambda function.

Each service is a separate entry point:

| Entry point | Service | AWS service |
| :-- | :-- | :-- |
| `@genoacms/adapter-aws/storage` | `storage` | S3 |
| `@genoacms/adapter-aws/database` | `database` | DynamoDB |
| `@genoacms/adapter-aws/secrets` | `secrets` | Secrets Manager |
| `@genoacms/adapter-aws/deployment` | deployment target | Lambda |

The config names the entry point as the adapter's specifier. The `…/runtime` entry points that the package also exports belong to the host; a config never names them. The package provides no authentication adapter: configure one from another package, as below.

## Configuration

```ts
// genoa.config.ts
import { defineConfig, storageProvider, databaseProvider, secretsProvider, authenticationProvider, languageProvider, deploymentTarget, secret } from '@genoacms/config'
import type {} from '@genoacms/adapter-aws/storage'   // registers the adapter's option types; erased at runtime
import type {} from '@genoacms/adapter-aws/database'
import type {} from '@genoacms/adapter-aws/secrets'
import type {} from '@genoacms/adapter-aws/deployment'
import type {} from '@genoacms/authentication-adapter-array'

export default defineConfig({
  authentication: { cookieName: '__session', providers: { admins: authenticationProvider('@genoacms/authentication-adapter-array', { credentials: secret('GENOACMS_ADMIN_CREDENTIALS') }) } },
  secrets: { providers: { 'secrets-manager': secretsProvider('@genoacms/adapter-aws/secrets', { region: 'eu-central-1' }) } },
  storage: {
    providers: { s3: storageProvider('@genoacms/adapter-aws/storage', { region: 'eu-central-1' }) },
    buckets: { 'my-company-cms': { provider: 's3' } },
    defaultBucket: 'my-company-cms'
  },
  database: { providers: { dynamodb: databaseProvider('@genoacms/adapter-aws/database', { region: 'eu-central-1' }) }, databases: { main: { provider: 'dynamodb', collections: [] } } },
  languages: { providers: { typescript: languageProvider('@genoacms/language-adapter-ts', {}) } },
  deployment: {
    targets: {
      aws: deploymentTarget('@genoacms/adapter-aws/deployment', {
        region: 'eu-central-1',
        role: 'arn:aws:iam::123456789012:role/genoacms',
        artifactBucket: 'my-company-deployments'
      })
    }
  },
  authorization: { roles: { Administrator: [{ permission: '*', resource: '*' }] } },
  security: {}
})
```

The administrators' credentials, `GENOACMS_ADMIN_CREDENTIALS` here, must exist in the secrets store.

Every descriptor needs `region`. Every descriptor refuses an option it does not list, with one reason per key: `unknown option '<key>'`. A required string option that is missing, not a string or empty yields `<key> is required and must be a non-empty string`.

AWS SDK errors reach the caller unchanged, with their name, code and request ID (`NoSuchKey`, `ResourceNotFoundException`, `AccessDenied`). The adapter raises its own errors only where this document names them.

### Credentials

In a deployment, leave `credentials` out. Every runtime client then uses the SDK's default credential provider chain, which on Lambda yields the execution role's temporary credentials, so no credential ships with the build. The deployment target's `role` option names that role.

`credentials` exists for running outside AWS, for example a development config. It is a JSON object `{ accessKeyId, secretAccessKey, sessionToken? }`. Give it as `secret()`, `env()` or `inline()`, never as a bare value:

```ts
import { defineConfig, storageProvider, secretsProvider, env, secret } from '@genoacms/config'

// storage.providers
s3: storageProvider('@genoacms/adapter-aws/storage', { region: 'eu-central-1', credentials: secret('AWS_CREDENTIALS') })

// secrets.providers: the secrets provider cannot read from itself, so only env() or inline()
'secrets-manager': secretsProvider('@genoacms/adapter-aws/secrets', { region: 'eu-central-1', credentials: env('AWS_CREDENTIALS') })
```

| Field | `secret()` | `env()` | `inline()` |
| :-- | :-- | :-- | :-- |
| `credentials` of `storage`, `database` | yes | yes | yes; a production build warns |
| `credentials` of `secrets` | refused | yes | yes; a production build warns |
| `credentials` of the deployment target | yes, resolved on the operator's machine | yes | yes; never enters the build |

Each provider creates its own client with its own credential, so two providers on one service (two regions, two accounts) share neither.

## Storage: `@genoacms/adapter-aws/storage`

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `region` | `string` | required | The AWS region of the S3 client. |
| `credentials` | `{ accessKeyId, secretAccessKey, sessionToken? }`, JSON | the SDK's default chain | See Credentials. |

The buckets the config assigns to the provider are the only ones it serves. A reference to any other bucket throws `bucket-unregistered` before any request.

- **Versions** are the object's ETag, quotes included, as S3 sends it. A conditional write sends `If-None-Match: *` (`ifAbsent`) or `If-Match` (`ifVersion`) on a single `PutObject`, so it is limited to 5 GB. HTTP 412 or 409 on a conditional write throws `storage/precondition-failed: <bucket>/<name>: <reason>`, where the reason is `object already exists` or `object changed since it was read`. An unconditional write uses the SDK's multipart upload.
- **Public URL** is `https://<bucket>.s3.<region>.amazonaws.com/<encodeURIComponent(name)>`. The adapter does not check that the object is public; that is the bucket's policy.
- **Signed URL** is a Signature Version 4 presigned `GetObject` URL, valid for `floor((expires - now) / 1000)` seconds. S3 refuses a lifetime over 604800 seconds (7 days), and the error propagates. A URL signed with an execution role's temporary credentials stops working when the role's session expires, which can be before `expires`.
- **Missing object**: reading a missing object rejects with `ObjectNotFoundError`, and so does deleting one.
- **Directories** do not exist in S3. `createDirectory` writes an empty object `<name>.folderPlaceholder`, and listings hide objects whose name ends in `.folderPlaceholder`. A directory created in the S3 console, which writes an empty `name/` object, is listed, but that object is not shown. Listing returns one level (delimiter `/`) and one page per call; `next` is the continuation token.
- **Moving** an object is a copy and then a delete, since S3 has no rename. `CopyObject` takes objects up to 5 GB; a larger one fails the move. A move that fails between the copy and the delete leaves the object under both names.
- **Deleting a directory** removes every object under it, at every depth, at most 1000 keys per request. The first key S3 reports as failed throws `storage/delete-failed: <bucket>/<key>: <code>`. A failure part-way leaves the directory partly deleted.
- **Moving a directory** lists every object under it first, then moves them one at a time. It stops at the first failure and leaves the directory partly moved.

Needed on the runtime identity, on every configured bucket and its objects: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`. A move needs get and put for the copy and delete for the original.

## Database: `@genoacms/adapter-aws/database`

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `region` | `string` | required | The AWS region of the DynamoDB client. |
| `credentials` | `{ accessKeyId, secretAccessKey, sessionToken? }`, JSON | the SDK's default chain | See Credentials. |

**Tables are yours to create.** A collection `{ name, primaryKey: { key, schema } }` is the DynamoDB table `name`, with a partition key named `key`, of type string, and no sort key. The adapter never creates, changes or deletes a table. A collection defined without its table fails on first use with DynamoDB's `ResourceNotFoundException`. Each table is provisioned, and billed, separately.

- **Only string keys.** A collection whose `primaryKey.schema.type` is not `'string'` is refused with `database/unsupported-key-type: <name>`, before any request. The adapter generates document IDs as UUIDs.
- **Values** are strings, finite numbers, booleans, `null`, arrays and plain objects, recursively. A field whose value is `undefined` is omitted. Anything else (`NaN`, `Infinity`, a `bigint`, a `Date`, another class instance, `undefined` in an array) throws `database/unsupported-value: <path>` before any request, where `<path>` is the field's dotted path. Numbers read back as JavaScript numbers. DynamoDB sets and binary values are not supported. An item holds at most 400 KB.
- **Reads are strongly consistent**: a document read right after its write returns that write. A strongly consistent read costs twice an eventually consistent one.
- `createDocument` ignores a key field in the data, generates the ID, and does not overwrite an existing item. `updateDocument` merges the given fields and fails with `DocumentNotFoundError` when the document does not exist; a key field that differs from the ID throws `database/key-immutable: <key>`. `getDocument` returns `undefined` for a missing document. `deleteDocument` of a missing document is not an error.
- `getCollection` is a filtered `Scan`. It follows DynamoDB's pages until it has `limit` matches or the scan ends, in DynamoDB's scan order. A page token that is not a key of the table's key attribute is refused with `database/invalid-query:`.

Needed on the runtime identity, on every collection's table: `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Scan`.

## Secrets: `@genoacms/adapter-aws/secrets`

Only one secrets provider may be configured.

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `region` | `string` | required | The AWS region of the Secrets Manager client. |
| `credentials` | `{ accessKeyId, secretAccessKey, sessionToken? }`, JSON | the SDK's default chain | `env()` or `inline()` only. Leave it out in a deployment. |

A key is the secret's name, unchanged. A key Secrets Manager does not accept fails with its error.

- **Reading** returns the `SecretString` of the `AWSCURRENT` version. It returns `undefined` when the secret does not exist or is scheduled for deletion. A secret holding only `SecretBinary` throws `secrets/not-a-string: <key>`.
- **Overwriting** (`setSecret`) puts a new value, and creates the secret when it does not exist.
- **Claiming** (`setSecretIfAbsent`) creates the secret and resolves `true`, or resolves `false` when it already exists.
- **Deleting** removes the secret immediately, without a recovery window (`ForceDeleteWithoutRecovery`), and resolves `true`; it resolves `false` when the secret does not exist or is already deleted. It does not wait for the deletion to complete, so for a secret deleted moments before, the delete can still see it and resolve `true`.

Needed on the runtime identity, on the account's secrets or on the names core uses (`GENOACMS_*`): `secretsmanager:GetSecretValue`, `DescribeSecret`, `PutSecretValue`, `CreateSecret`, `DeleteSecret`. Core creates its signing seeds on first start.

## Deployment: `@genoacms/adapter-aws/deployment`

A deployment target that runs the whole CMS as one Lambda function, reached by its function URL. Build and deploy it with `genoa build <target>` and `genoa deploy <target>` from `@genoacms/cli`.

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `region` | `string` | required | The AWS region of the function. |
| `role` | IAM role ARN | required | The function's execution role. Must match `arn:aws…:iam::<12 digits>:role/<name>`. |
| `artifactBucket` | `string` | required | The S3 bucket the deployment archive is uploaded to. |
| `functionName` | 1 to 64 letters, digits, `-` or `_` | `genoacms` | The function's name. |
| `memory` | integer, 128 to 10240 | `1024` | Memory in megabytes. |
| `timeoutSeconds` | integer, 1 to 900 | `30` | The function's timeout. |
| `origin` | `http(s)://host[:port]`, no path | none | The origin browsers use. Without it, the origin comes from the forwarded headers of the function URL. Fixed at build time, so one build serves one origin. |
| `credentials` | `{ accessKeyId, secretAccessKey, sessionToken? }`, JSON | the operator's default chain | The operator identity, resolved on the operator's machine. Never embedded in the build. |

Any other key is refused, including the former `accountId`. An invalid option yields one reason, in the order of the table:

```
role must be an IAM role ARN
functionName must be 1 to 64 letters, digits, '-' or '_'
memory must be an integer from 128 to 10240
timeoutSeconds must be an integer from 1 to 900
origin must be an absolute http(s) origin such as 'https://cms.example.com'
```

A fuller target:

```ts
aws: deploymentTarget('@genoacms/adapter-aws/deployment', {
  region: 'eu-central-1',
  role: 'arn:aws:iam::123456789012:role/genoacms',
  artifactBucket: 'my-company-deployments',
  functionName: 'genoacms',
  memory: 1024,
  timeoutSeconds: 30,
  origin: 'https://cms.example.com',
  credentials: secret('AWS_DEPLOY_CREDENTIALS')
})
```

### What a deploy does

1. Copies the build directory to a work directory. Without `<buildDir>/package.json` it fails with `deploy/no-runtime-package: <buildDir>/package.json is missing; build with genoa build`. It adds `genoacms-lambda.js`, the entry that serves the SvelteKit Node handler, and an executable `run.sh`.
2. Installs the dependencies for Lambda's platform with `npm install --omit=dev --no-audit --no-fund --os=linux --cpu=x64 --libc=glibc`, so native packages get Linux x64 binaries even on a Mac or an ARM machine. A non-zero exit fails with `deploy/install-failed: <stderr>`. A package whose install script compiles for the host still compiles for the host.
3. Zips the staged directory (level 9) and uploads it to `artifactBucket` as `.genoacms/deployment/<functionName>.zip`. A failure throws `deploy/upload-failed: <message>`.
4. Looks the function up. Only `ResourceNotFoundException` means it does not exist; any other error stops the deploy.
5. Creates the function (runtime `nodejs22.x`, architecture `x86_64`, handler `run.sh`) or updates its code and then its whole configuration, waiting for each step. The whole configuration is sent on every deploy, so a setting changed in the console is reverted. A function or update that ends `Failed` throws `deploy/function-failed: <reason>`; after a failed update the previous code keeps serving.
6. Ensures the function URL exists, with `AuthType: NONE` and `InvokeMode: BUFFERED`, and the two public-access permission statements it needs. Already existing ones are not an error.
7. Prints `Function URL: <FunctionUrl>`.

The function runs behind the Lambda Web Adapter layer `arn:aws:lambda:<region>:753240598075:layer:LambdaAdapterLayerX86:30`, which must be available in the region. Its environment is `NODE_ENV=production`, `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap`, `PORT=8080` and `ADDRESS_HEADER=x-genoacms-client-address`, plus `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=host` when `origin` is not set. The URL is public: anyone can request it.

Limits and caveats:

- The function answers in buffered mode: a response over 6 MB fails, and so does a request body over 6 MB, which bounds the size of a file uploaded through the CMS.
- A function URL has no custom domain. Behind CloudFront the host differs from the forwarded one, so `origin` must be set.
- The client address comes from the request context of the function URL, not from `X-Forwarded-For`, which a client can forge. Behind CloudFront it is CloudFront's address.
- Every cold start starts the whole server.

### Permissions

| Identity | Needs | On |
| :-- | :-- | :-- |
| Operator (runs `genoa deploy`) | `lambda:GetFunction`, `GetFunctionConfiguration`, `CreateFunction`, `UpdateFunctionCode`, `UpdateFunctionConfiguration`, `GetFunctionUrlConfig`, `CreateFunctionUrlConfig`, `AddPermission` | the function |
| Operator | `lambda:GetLayerVersion` | the Lambda Web Adapter layer |
| Operator | `iam:PassRole` | the execution role |
| Operator | `s3:PutObject` | the artifact bucket, `.genoacms/deployment/*` |
| Runtime (the execution role) | the grants listed per service above | |
| Runtime | `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` | the function's log group (managed policy `AWSLambdaBasicExecutionRole`) |

`genoa deploy` does not check grants. A missing runtime grant fails at runtime with AWS's `AccessDenied` error.
