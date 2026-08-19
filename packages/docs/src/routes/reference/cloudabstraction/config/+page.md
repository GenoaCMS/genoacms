---
title: Config type
---

The shape of `genoa.config`, as `@genoacms/cloudabstraction` declares it. What each service's
provider entries look like is on that service's own page; what is authoritative versus merely seeded
is covered under [configuration](/guide/config/structure).

```ts
import type { AuthenticationProvider } from './services/authentication/index.d'
import type { DatabaseInit, DatabaseProvider } from './services/database/index.d'
import type { DeploymentProvider } from './services/deployment/index.js'
import type { SecretProvider } from './services/secrets/index.d'
import type { BucketInit, StorageProvider } from './services/storage/index.d'

type Config<Extension extends object = object> = Extension & {
  authentication: {
    providers: AuthenticationProvider[]
    cookieName: string
  }
  database: {
    databases: DatabaseInit[]
    providers: DatabaseProvider[]
  }
  deployment: {
    providers: DeploymentProvider[]
  }
  secrets: {
    /** Exactly one. A secret store is a single authority. */
    providers: SecretProvider[]
  }
  security: {
    /** Roles declared before deployment. Authoritative, and immutable at runtime. */
    roles?: Record<string, Array<{ permission: string, resource: unknown }>>
    /** Which subjects hold which roles. Resolved without reading storage. */
    assignments?: Record<string, string[]>
    /** Refuses all runtime role and assignment administration. */
    lockRoles?: boolean

    // The rest seed the signed security policy document at first start; the live values are held
    // there afterwards, and editing them here no longer moves a running instance.
    accessTokenMinutes?: number
    refreshTokenDays?: number
    grantCacheSeconds?: number
    subordinateKeyRotationDays?: number
  }
  storage: {
    defaultBucket: string
    buckets: BucketInit[]
    providers: StorageProvider[]
  }
  [key: string]: any
}

export default Config
```

:::note[There is no `authorization` key]
Authorization is a core module rather than a service, so it has no providers to configure. What
appears above under `security` is *authorization data* — roles and who holds them — not an adapter
for deciding permissions. See [adapters](/guide/adapters).
:::
