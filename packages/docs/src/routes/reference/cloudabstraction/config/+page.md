---
title: Config type
---

```ts
import type { AuthenticationProvider } from './services/authentication/index.d'
import type { DatabaseInit, DatabaseProvider } from './services/database/index.d'
import type { DeploymentModule } from './services/deployment/index.d'
import type { BucketInit, StorageProvider } from './services/storage/index.d'

type Config<Extension extends object = object> = Extension & {
  authentication: {
    providers: AuthenticationProvider[]
    cookieName: string
    JWTSecret: string
  }
  database: {
    databases: DatabaseInit[]
    providers: DatabaseProvider[]
  }
  deployment: {
    adapter: Promise<DeploymentModule>
  }
  storage: {
    defaultBucket: string
    buckets: BucketInit[]
    providers: StorageProvider[]
  }
  security: {
    adminSubject: string
  }
  [key: string]: any
}

export default Config
```

