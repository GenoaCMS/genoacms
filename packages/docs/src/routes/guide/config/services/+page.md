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
    JWTSecret: string
}
```

:::info[Ensure cookie name is valid]
Some cloud hosting services strip cookies from requests and allow only specific ones. To avoid breaking auth, set the cookie name to a value that is not stripped.
:::

:::warning[Change JWT secret]
To reduce risk of token compromise, set the JWT secret to have unique value.
:::

## Authorization

This service is responsible for checking whether the user has permission to access GenoaCMS. In current state of GenoaCMS, it is just a simple check for user role.

### Config type

```ts
authorization: {
    providers: AuthorizationProvider[]
}
```

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
