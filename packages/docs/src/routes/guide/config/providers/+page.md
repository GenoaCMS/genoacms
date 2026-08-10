---
title: Providers API
---

All GenoaCMS services except deployment feature providers API. It is interface for registering service's adapters associated with particular service instance. It allows to define multiple providers for multiple services of a type.

For instance, you can configure GenoaCMS to communicate with three databases, one dynamoDB, one Firestore instance A and one Firestore instance B. This configuration would require two adapters: for Firestore and for DynamoDB; and three service credentials.

## Structure of a provider

```js
{
    name: 'myProvider',
    adapter: import('package'),
    ...other
}

```

The `name` is unique identifier of the provider, it is used to reference the provider in the configuration of service's resources. 

The `adapter` is a promise to module that implements functions declared in package `@genoacms/cloudabstraction`. It is used to communicate with the service instance.

:::note[Check particular adapter documentation]
Other fields are optional and depend on the adapter implementation. They can be used to pass additional configuration to the adapter. See the adapter documentation for more information.
:::

## Referencing a provider

Services like database and storage have resources bound to certain provider. To link a resource to a provider, the provider name is used. 

Consider bucket declaration in storage service: 

```js
{
    name: 'myBucket',
    providerName: 'myStorageProvider'
}
```
