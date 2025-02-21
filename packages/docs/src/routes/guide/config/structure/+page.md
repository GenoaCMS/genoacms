---
title: Configuration
---

GenoaCMS is structured by services, those are: authentication, authorization, database, deployment and storage. Each service is configurable. 

The config file is a JS file exporting default object with structure `genoaConfig` defined in package `@genoacms/cloudabstraction`. 

Configuration entry file is located in `{projectRoot}/genoa.config/index.js`. 

Each service has its own configuration object with its [adapter and other configurable fields](/guide/config/services). 

## Example structure

```js
/**
 * @type {import('@genoacms/cloudabstraction').genoaConfig}
 */
const config = {
  authentication: {
    providers: [
      { adapter: import('package'), ... }
    ],
    cookieName: '__session',
    JWTSecret: 'mySuperSecretKey'
  },
  authorization: {
    providers: [
      { adapter: import('package'), ... }
    ]
  },
  database: {
    databases: [
      {
        name: 'myDb',
        providerName: 'myDbProvider',
        collections: [{ ... }]
      }
    ],
    providers: [
      { name: 'myDbProvider', adapter: import('package'), ... }
    ]
  },
  deployment: {
    adapter: import('package'),
    ...
  },
  storage: {
    defaultBucket: 'myBucket',
    buckets: [
      {
        name: 'myBucket',
        providerName: 'myStorageProvider'
      }
    ],
    providers: [
      { name: 'myStorageProvider', adapter: import('package'), ... }
    ]
  }
}

export default config
```
