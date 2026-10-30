# `@genoacms/adapter-gcp`

GenoaCMS on Google Cloud: Cloud Storage, Firestore, Secret Manager, Identity Platform sign-in, and a deployment target for Cloud Run functions.

Each service is a separate entry point:

| Entry point | Service | Google service |
| :-- | :-- | :-- |
| `@genoacms/adapter-gcp/storage` | `storage` | Cloud Storage |
| `@genoacms/adapter-gcp/database` | `database` | Firestore (native mode) |
| `@genoacms/adapter-gcp/secrets` | `secrets` | Secret Manager |
| `@genoacms/adapter-gcp/authentication/identity-platform` | `authentication` | Identity Platform |
| `@genoacms/adapter-gcp/deployment` | deployment target | Cloud Run functions (2nd gen) |

The config names the entry point as the adapter's specifier. The `…/runtime` entry points that the package also exports belong to the host; a config never names them. A Firestore-backed identity store is not yet available.

## Configuration

```ts
// genoa.config.ts
import { defineConfig, storageProvider, databaseProvider, secretsProvider, authenticationProvider, languageProvider, deploymentTarget } from '@genoacms/config'
import type {} from '@genoacms/adapter-gcp/storage'   // registers the adapter's option types; erased at runtime
import type {} from '@genoacms/adapter-gcp/database'
import type {} from '@genoacms/adapter-gcp/secrets'
import type {} from '@genoacms/adapter-gcp/authentication/identity-platform'
import type {} from '@genoacms/adapter-gcp/deployment'

export default defineConfig({
  authentication: { cookieName: '__session', providers: { identity: authenticationProvider('@genoacms/adapter-gcp/authentication/identity-platform', { projectId: 'my-project' }) } },
  secrets: { providers: { 'secret-manager': secretsProvider('@genoacms/adapter-gcp/secrets', { projectId: 'my-project' }) } },
  storage: {
    providers: { gcs: storageProvider('@genoacms/adapter-gcp/storage', { projectId: 'my-project' }) },
    buckets: { 'my-project-cms': { provider: 'gcs' } },
    defaultBucket: 'my-project-cms'
  },
  database: { providers: { firestore: databaseProvider('@genoacms/adapter-gcp/database', { projectId: 'my-project' }) }, databases: { main: { provider: 'firestore', collections: [] } } },
  languages: { providers: { typescript: languageProvider('@genoacms/language-adapter-ts', {}) } },
  deployment: {
    targets: {
      gcp: deploymentTarget('@genoacms/adapter-gcp/deployment', { projectId: 'my-project', region: 'europe-west3' })
    }
  },
  authorization: { roles: { Administrator: [{ permission: '*', resource: '*' }] } },
  security: {}
})
```

Every descriptor needs `projectId`. Every descriptor refuses an option it does not list, with one reason per key: `unknown option '<key>'`. A required string option that is missing, not a string or empty yields `<key> is required and must be a non-empty string`.

### Credentials

In a deployment, leave `credentials` out. Every runtime client then uses Application Default Credentials, which on Cloud Run functions is the function's own service account, so no key ships with the build. The deployment target's `serviceAccount` option names that account.

`credentials` exists for running outside Google Cloud, for example a development config. It takes a service-account key file as JSON. Give it as `inline()`, `env()` or `secret()`, never as a bare value:

```ts
import { defineConfig, storageProvider, secretsProvider, inline, env } from '@genoacms/config'
import serviceAccount from './serviceAccount.json' with { type: 'json' }

// storage.providers
gcs: storageProvider('@genoacms/adapter-gcp/storage', { projectId: 'my-project', credentials: inline(serviceAccount) })

// secrets.providers: the secrets provider cannot read from itself, so only env() or inline()
'secret-manager': secretsProvider('@genoacms/adapter-gcp/secrets', { projectId: 'my-project', credentials: env('GOOGLE_SERVICE_ACCOUNT') })
```

| Field | `secret()` | `env()` | `inline()` |
| :-- | :-- | :-- | :-- |
| `credentials` of `storage`, `database`, `authentication` | yes | yes | yes; a production build warns |
| `credentials` of `secrets` | refused | yes | yes; a production build warns |
| `credentials` of the deployment target | yes, resolved on the operator's machine | yes | yes; never enters the build |

Each provider creates its own client with its own credential, so two providers on one service (for example two projects) share neither.

## Storage: `@genoacms/adapter-gcp/storage`

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `projectId` | `string` | required | The Google Cloud project. |
| `credentials` | service-account key, JSON | Application Default Credentials | See Credentials. |

The buckets the config assigns to the provider are the only ones it serves. A reference to any other bucket throws `bucket-unregistered` before any request.

- **Versions** are the object's generation, as a decimal string. A conditional write uses it: `ifAbsent` writes only if the object does not exist, `ifVersion` only if the generation still matches. A refused write throws `storage/precondition-failed: <bucket>/<name>: <reason>`, where the reason is `object already exists` or `object changed since it was read`.
- **Public URL** is `https://storage.googleapis.com/<bucket>/<encodeURIComponent(name)>`. The adapter does not check that the object is public; that is the bucket's configuration.
- **Signed URL** is a V2 signed read URL. Under Application Default Credentials the signature goes through IAM `signBlob`, so the runtime service account needs `iam.serviceAccounts.signBlob` on itself. This path is not yet verified against the real service.
- **Directories** do not exist in Cloud Storage. `createDirectory` writes an empty object `<name>.folderPlaceholder`, and listings hide objects whose name ends in `.folderPlaceholder`. Listing returns one level (delimiter `/`) and one page per call. A page may hold one entry fewer than `limit` when `startAfter` names an entry.
- **Deleting a directory** removes every object under it, at every depth, with at most 10 deletes in flight. After the first failed delete no further delete starts and the call rejects with that error. The directory is then partly deleted.
- **Moving a directory** lists every object under it first, then moves them one at a time. The first failed move rejects and no further object is moved, which leaves the directory partly moved. A single-object move is a rename within the bucket.

Needed on the runtime identity, on each configured bucket: read, create, overwrite, list, delete and move objects. `roles/storage.objectAdmin` covers it.

## Database: `@genoacms/adapter-gcp/database`

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `projectId` | `string` | required | The Google Cloud project. |
| `databaseId` | `string` | `(default)` | The Firestore database. |
| `credentials` | service-account key, JSON | Application Default Credentials | See Credentials. |

- A collection is the Firestore collection of the same name in that database, with no prefix and no mapping.
- A document's key field always equals its Firestore document ID. `createDocument` ignores a key field in the data and uses a new generated ID. `updateDocument` merges the given fields (a dotted name is one top-level field) and fails with `DocumentNotFoundError` when the document does not exist. A key field that differs from the ID throws `database/key-immutable: <key>`.
- `getDocument` returns `undefined` for a missing document, and for an ID Firestore cannot hold. `deleteDocument` of a missing document is not an error.
- A query whose answer Firestore cannot give without a composite index fails with `UnsupportedQueryError`. Create the index Firestore names.
- A page token with the wrong number of values is refused with `database/invalid-query:`.

Needed on the runtime identity: read and write documents in the database. `roles/datastore.user` covers it.

## Secrets: `@genoacms/adapter-gcp/secrets`

Only one secrets provider may be configured.

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `projectId` | `string` | required | The Google Cloud project. |
| `credentials` | service-account key, JSON | Application Default Credentials | `env()` or `inline()` only. Leave it out in a deployment. |

Secrets are `projects/<projectId>/secrets/<key>`. A key must match `[A-Za-z_][A-Za-z0-9_]*`, otherwise the call throws `invalid-secret-key`.

- **Reading** returns the `latest` version as a UTF-8 string. It returns `undefined` when there is no `latest` version to read: the secret does not exist, has no versions, or has an empty payload. Any other failure propagates, including a disabled or destroyed `latest`.
- **Overwriting** creates the secret when it is missing, adds a version, and then destroys every enabled version with a lower number. Secrets the adapter creates have automatic replication and a recovery window of 7 days (`versionDestroyTtl` of 604800 seconds). Destroyed versions can be recovered during that window, and not after it. Secrets created outside GenoaCMS keep the destroy TTL you gave them.
- **Cleanup is best effort.** A failure in it is printed as a warning, `secrets/cleanup-failed: <key>: <message>` (or `secrets/unexpected-version-name: <name>` inside it for an unnumbered version), and the overwrite still succeeds. The next overwrite retries the cleanup.
- **Claiming** (`setSecretIfAbsent`) creates the secret atomically, then adds its first version in a second call; in between, the secret exists without a value. It resolves `false` when the secret exists. It does no cleanup.
- **Deleting** removes the secret with all its versions, and resolves `false` when it does not exist.

Eventual consistency: a read right after an overwrite can still return the previous value, because `latest` may not have moved yet. After you disable a version or delete a secret, reading `latest` can still return the old value for a short while. A secret disabled to revoke it is still served until the change has propagated.

Needed on the runtime identity: get and create secrets, add and access versions, and list and destroy versions. Without the last two, overwrites warn and versions accumulate. `roles/secretmanager.admin` covers all of it; narrower, a custom role with `secretmanager.secrets.get`, `secretmanager.secrets.create`, `secretmanager.versions.add`, `secretmanager.versions.access`, `secretmanager.versions.list` and `secretmanager.versions.destroy`.

## Authentication: `@genoacms/adapter-gcp/authentication/identity-platform`

Signs users in against Identity Platform (and Firebase Authentication) with email and password. GenoaCMS stores no password and no password hash. The adapter offers no user management: manage users in Identity Platform.

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `projectId` | `string` | required | The Google Cloud project. |
| `tenantId` | `string` | none | An Identity Platform tenant. Omit it for the project's own user pool. A present value that is not a non-empty string yields `tenantId must be a non-empty string`. |
| `apiKey` | string secret | none | An API key for signing in. Without it, the call carries the runtime identity's access token (scope `https://www.googleapis.com/auth/identitytoolkit`). |
| `credentials` | service-account key, JSON | Application Default Credentials | Only for running outside Google Cloud. |

Sign-in results:

| Outcome | Result |
| :-- | :-- |
| Success | `{ subject, email }`, taken from the response. |
| A second factor is required | `{ rejected: 'second-factor-required' }`. There is no second step. |
| `INVALID_LOGIN_CREDENTIALS`, `EMAIL_NOT_FOUND`, `INVALID_PASSWORD`, `INVALID_EMAIL`, `MISSING_PASSWORD`, `USER_DISABLED` | `{ rejected: 'credentials' }`. `USER_DISABLED` is reported as `credentials` too. |
| `TOO_MANY_ATTEMPTS_TRY_LATER` | throws `authentication/throttled`. |
| Anything else: network error, timeout, `403`, `5xx`, an invalid key, an unlisted `400` such as `OPERATION_NOT_ALLOWED`, a `200` without a usable body | throws `authentication/provider-failed: <status> <message>`, where `<status>` is the HTTP status or `network`. |

The sign-in call is never retried and is abandoned after 10 seconds. A failed outcome is thrown rather than reported as a wrong password, so an outage is not mistaken for one. The returned tokens are discarded: never stored, logged or returned.

Looking up a user by subject follows the same rules. A disabled user, or one without an email, is reported as not found; any failed lookup throws `authentication/provider-failed:`, so an outage does not end a session.

Needed on the runtime identity: permission to sign users in and look them up, by an IAM grant or, for signing in, an API key. `roles/firebaseauth.viewer` is the starting point; whether it suffices for every call is not yet confirmed.

## Deployment: `@genoacms/adapter-gcp/deployment`

A deployment target that runs the whole CMS as one Cloud Run function (2nd gen). Build and deploy it with `genoa build <target>` and `genoa deploy <target>` from `@genoacms/cli`.

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `projectId` | `string` | required | The Google Cloud project. |
| `region` | `string` | required | The function's region. |
| `functionName` | `string` | `genoacms` | The function's name. |
| `credentials` | service-account key, JSON | the operator's Application Default Credentials | The operator identity, resolved on the operator's machine. Never embedded in the build. |
| `runtime` | `nodejs<N>` | `nodejs22` | The Node.js runtime. |
| `memory` | `<number>` + `M`, `Mi`, `G` or `Gi` | platform default | `availableMemory`, for example `512Mi` or `1Gi`. |
| `timeoutSeconds` | integer, 1 to 3600 | platform default | The request timeout. |
| `minInstances` | integer, at least 0 | `0` | Minimum instances. |
| `maxInstances` | integer, at least 1 | `1` | Maximum instances. |
| `ingress` | `all`, `internal` or `internal-and-gclb` | `all` | Who may reach the function. |
| `serviceAccount` | service-account email | the project's default compute service account | The runtime identity. |
| `origin` | `http(s)://host[:port]`, no path | none | The origin browsers use, for when a proxy rewrites the forwarded host. Fixed at build time, so one build serves one origin. Never set as an environment variable. |
| `xffDepth` | integer, at least 1 | `1` | Which `X-Forwarded-For` entry, counted from the right, is the client. Set as `XFF_DEPTH`. |

An invalid option yields one reason, in the order of the table:

```
runtime must be a Node.js runtime such as 'nodejs22'
memory must be a size such as '512Mi' or '1Gi'
timeoutSeconds must be an integer from 1 to 3600
minInstances must be an integer of at least 0
maxInstances must be an integer of at least 1
ingress must be 'all', 'internal' or 'internal-and-gclb'
serviceAccount must be a service account email
origin must be an absolute http(s) origin such as 'https://cms.example.com'
xffDepth must be an integer of at least 1
minInstances must not exceed maxInstances
```

A fuller target:

```ts
gcp: deploymentTarget('@genoacms/adapter-gcp/deployment', {
  projectId: 'my-project',
  region: 'europe-west3',
  functionName: 'genoacms',
  memory: '1Gi',
  timeoutSeconds: 60,
  minInstances: 0,
  maxInstances: 3,
  ingress: 'all',
  serviceAccount: 'genoacms@my-project.iam.gserviceaccount.com',
  origin: 'https://cms.example.com',
  xffDepth: 1
})
```

### What a deploy does

1. Copies the build directory, sets `"main": "function.js"` in the copied `package.json` and writes the entry module `function.js`. Without `<buildDir>/package.json` it fails with `deploy/no-runtime-package: <buildDir>/package.json is missing; build with genoa build`.
2. Zips the staged directory (level 9). Only the build artifact leaves your machine: no source, no config, no credential.
3. Requests an upload URL in `projects/<projectId>/locations/<region>` and `PUT`s the zip to it. A response that is not ok fails with `deploy/upload-failed: <status> <statusText>`. A response without an upload URL fails with `Upload URL not found`.
4. Looks the function up. Only a `NOT_FOUND` means it does not exist; any other error stops the deploy. Then it creates or updates the function with the settings above. The whole configuration is sent on every deploy, so a setting changed in the console is reverted.
5. Waits for the platform. A failed build or operation fails the deploy with `deploy/function-failed: <operation error message>`.
6. Prints `Function URL: <url>` when the function reports one.

The function gets `NODE_ENV=production`, `IGNORED_ROUTES` set to the empty string, and `XFF_DEPTH` when `xffDepth` is set.

The function is served by `@genoacms/sveltekit-adapter-cloud-run-functions`, which this package depends on. It reads `XFF_DEPTH` at start and fails to start with `XFF_DEPTH must be a positive integer, not '<value>'` for any other value. It no longer reads `ORIGIN`: if the function has an `ORIGIN` variable, it fails to start with `ORIGIN is no longer read; set the origin at build time with paths.origin (the gcp target's origin option)`. A request path that starts with `//` stays a path on the same host.

### Permissions

| Identity | Needs | Predefined roles |
| :-- | :-- | :-- |
| Operator (runs `genoa deploy`) | create, get and update functions; generate upload URLs; wait on operations, in the project and region | `roles/cloudfunctions.developer` |
| Operator | `iam.serviceAccounts.actAs` on the runtime service account | `roles/iam.serviceAccountUser` on that account |
| Runtime (the function's service account) | the grants listed per service above | `roles/storage.objectAdmin` on each bucket, `roles/datastore.user`, `roles/secretmanager.admin`, `roles/iam.serviceAccountTokenCreator` on itself, `roles/firebaseauth.viewer` with Identity Platform |

`genoa deploy` does not check grants. A missing runtime grant fails at runtime: storage reports unreachable storage, and the first start reports the secret it could not read or create.
