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
import type { Permission } from './authorization/permissions.d'
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
  // Authority: re-read on every resolution, never consumed.
  authorization: {
    /** Roles declared before deployment. Authoritative, and immutable at runtime. */
    roles?: Record<string, Array<{ permission: Permission, resource: unknown, fields?: string[] | '*' }>>
    /** Which subjects hold which roles. Resolved without reading storage. */
    assignments?: Record<string, string[]>
    /** Refuses all runtime role and assignment administration. */
    lockRoles?: boolean
  }
  // Seeds: consumed once, then owned by the signed security policy document.
  security: {
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

:::note[The `authorization` stanza is data, not a service]
It declares roles and who holds them. There are no providers to configure and no adapter to choose:
authorization is a core module, and only *who your users are* is delegated. See
[adapters](/guide/adapters).
:::
