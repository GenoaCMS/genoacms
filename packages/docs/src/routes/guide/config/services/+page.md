---
Services
---

GenoaCMS splits its responsibilities into services. 

## Authentication

This service is responsible for checking whether the user is who they claim to be. Additionally, it is responsible for creating and managing user sessions. GenoaCMS uses JWT tokens transported in cookies to manage sessions. 

### Config type

```ts 
authentication: {
    providers: AuthenticationProvider[]
    cookieName: string
    JWTSecret: SecretReference
}
```

:::info[Ensure cookie name is valid]
Some cloud hosting services strip cookies from requests and allow only specific ones. To avoid breaking auth, set the cookie name to a value that is not stripped.
:::

`JWTSecret` is a **reference**, never the key itself:

```ts
JWTSecret: { secret: 'GENOACMS_JWT_SECRET' }
```

The value is resolved from the [secrets service](/reference/cloudabstraction/secrets/) at startup. `genoa.config` is committed
to a repository, so a literal here would put the key that signs every session token into version
control. Startup fails with a message naming the setting if the secret is absent, rather than
falling back to anything.

:::warning[Use a unique value per instance]
Give each instance its own long random secret. Changing it invalidates every existing session.
:::

:::note[Authorization is not a service]
Authorization used to be a service with cloud adapters, on the assumption that a deployment could
inherit access control from its cloud platform's IAM. It has been removed. Cloud IAM can grant
"read bucket X"; it cannot express which collections or which fields a principal may reach, it
would require a cloud identity for every copywriter and translator, and permissions such as
`pages:publish` have no meaning outside GenoaCMS.

Authentication is federated because *"who are you?"* is a standardised question. Authorization
answers *"what may you do in this application?"*, so it is a core module of GenoaCMS with no
adapters and no configuration stanza.
:::

## Security

Not a service — a plain configuration stanza. It declares the seed administrator, the identity
that bootstraps the permission system.

### Config type

```ts
security: {
    adminSubject: string
}
```

`adminSubject` is the `subject` of an identity as issued by the authentication adapter, never an
email address. It is resolved from `genoa.config` alone, so it remains authoritative on an instance
whose stored authorization data is missing or cannot be trusted.

:::caution[Configuration is the root of authority]
`genoa.config` is written before deployment and is not modifiable at runtime. Nothing the CMS
stores can grant the seed administrator's authority to another identity.
:::

## Secrets

Service responsible for holding credentials that must not live in the primary storage bucket or in
`genoa.config` — signing keys, the JWT secret, database and storage credentials.

### Config type

```ts
secrets: {
    providers: SecretProvider[]
}
```

:::caution[Exactly one provider]
Only one secret store may be configured. A secret store is a single authority: with two, a write has
no defensible target, and a key present in one but not the other would make behaviour depend on
lookup order.
:::

:::warning[The .env adapter is for development]
`@genoacms/adapter-secrets-env` keeps secrets in plaintext in your project directory. Use a real
secret manager in a deployment; the contract is identical, so only the configuration changes.
:::

## Database

Service responsible for managing data storage. It is possible to define multiple databases and multiple providers.

### Config type

```ts 
database: {
    databases: DatabaseInit[]
    providers: DatabaseProvider[]
  }
```
In order to manage a database, at least one provider, database and collection must be registered.

### DatabaseInit

```ts
interface DatabaseInit {
  providerName: string
  collections: CollectionReference[]
  testDocuments?: [Document, Document]
}
```

This structure is used for registering a database and its collections.

Field `testDocuments` is only used when developing storage adapter for unit testing.

### CollectionReference

```ts
interface CollectionReference {
  name: string
  primaryKey: {
    key: string,
    schema: JSONSchemaType<any>
  },
  schema: JSONSchemaType<any>
}
```

This structure is used for registering a collection in a database. The `name` should reflect the name of the collection/table in the database. The `primaryKey` is used to declare which field of the document/row is used for its identification. The `schema` is used to define the structure of the collection.

The schema is defined using [JSON Schema](https://json-schema.org/). GenoaCMS additionally defines a few custom types in the `@genoacms/cloudabstraction` package. Those schemas are:

- `storageResource` - used to define a reference to a storage resource
- `nullableStorageResource` - used to define a nullable reference to a storage resource
- `reference` - used to define a reference to a document in another collection or database

:::note[Composed key]
Composed keys are currently not supported.
:::

## Deployment

Service responsible for deploying GenoaCMS to compute solution. No special configuration is required, just the adapter.

### Config type

```ts
deployment: {
    adapter: Promise<DeploymentAdapter>
}
```

## Storage

Service responsible for managing file storage. It is possible to define multiple buckets and multiple providers. It is required to define at least one bucket and one provider. GenoaCMS uses it to store its internal data.

### Config type

```ts
  storage: {
    defaultBucket: string
    buckets: BucketInit[]
    providers: StorageProvider[]
  }
```

Field `defaultBucket` is used to designate the bucket where GenoaCMS stores its internal data.

:::caution[Default bucket should be private]
For security reasons, the default bucket should not be publicly accessible. There is a recommendation to have at least two buckets: one for public data and one for private data.
:::

### BucketInit

```ts
interface BucketInit {
  name: string
  providerName: string
}
```

Structure for registering a bucket, the `name` shall match the name of existing bucket.
