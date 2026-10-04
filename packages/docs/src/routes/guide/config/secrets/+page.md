---
title: Secrets
---

A config never holds a credential as a plain value. Every option an adapter declares as a credential
takes one of three **references**, and GenoaCMS resolves it only when it constructs the provider.

| Reference | Resolved from | Use it for |
| :--- | :--- | :--- |
| `secret('KEY')` | the configured secrets provider | credentials in production |
| `env('VAR')` | `process.env` of the process constructing the provider | values the platform mounts as environment variables |
| `inline(value)` | the config itself: the value travels with the build | local credential files in development |

```ts
import { storageProvider, secret } from '@genoacms/config'

storageProvider('@genoacms/adapter-minio', {
  endPoint: 'minio.internal',
  accessKey: secret('MINIO_ACCESS_KEY'),
  secretKey: secret('MINIO_SECRET_KEY')
})
```

A plain value in a credential option is a type error, and a config that skips the types fails to
load with `config/bare-secret`. A reference anywhere else is refused with
`config/misplaced-reference`. Secret keys match `[A-Za-z_][A-Za-z0-9_]*`, the names every secret
manager and every environment accepts.

## Where each is resolved

References are resolved by the process that constructs the provider, and only there:

- **runtime providers** — storage, database, authentication, languages, secrets — on the server, when a request first needs each one;
- **deployment targets** on the operator's machine, when `genoa deploy` runs the target.

A deployment target's options therefore **never enter the build**, `inline()` included. A resolved
value is held by the adapter that received it and by a per-process cache, never in the build, never
in the Vite module graph, and never in an error message: errors name the field and the reference,
such as `storage.providers.minio.options.accessKey → MINIO_ACCESS_KEY`.

A provider's references are fetched together, so each provider costs one round trip at most, and
only when something first uses it. A secret that cannot be read within 10 seconds, or does not exist,
fails that provider's construction with a message naming it; the next request tries again.

## The bootstrap rule

The secrets provider's own options take `env()` or `inline()` only. Nothing exists yet to resolve a
`secret()` with when the store itself is being constructed. `defineSecretsAdapter` makes such an
adapter fail to compile, the option types refuse it, and the loader reports `config/bootstrap-secret`.

## In production: no credential at all

The recommended form is a secrets provider that authenticates as the platform's own identity, with
every other credential a `secret()`:

- on **GCP**, omit `credentials` everywhere: storage, Firestore, Secret Manager and Identity Platform use Application Default Credentials, which on Cloud Run are the function's service account;
- on **AWS**, omit `credentials`: the SDK's default chain is the Lambda function's execution role.

No credential then exists in the config, the build or the environment. The
[GCP and AWS examples](/guide/config/examples) are written this way.

`inline()` is allowed, because a local credential file is sometimes the honest choice in development.
In a production build each inline value warns once (`config/inline`), since it is written into the
artifact; `genoa build --no-inline` makes it an error instead. Inline values under
`deployment.targets` do not warn: they never enter the build.

## The development store

`@genoacms/adapter-secrets-env` keeps secrets in `.genoacms/secrets.env` under the project, one
`KEY=value` per line; `genoa init` adds `.genoacms/` to `.gitignore`. A read checks the values this
process wrote, then `process.env`, then the file.

It is development only: its descriptor is marked so, and a production build refuses it with
`config/development-only`. No other secrets store runs without a cloud account today, which is why
the [self-hosted example](/guide/config/examples#Self-hosted) is a development config.

## Rotation

Resolved values are cached for the life of the process, and a constructed client keeps its
credential regardless. A rotated secret therefore takes effect when the process restarts: on the next
cold start on a serverless platform, and on the next restart of a Node server. There is no reload
endpoint.
