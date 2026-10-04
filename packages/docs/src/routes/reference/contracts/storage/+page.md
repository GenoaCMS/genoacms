---
title: Storage contract
---

What a storage adapter implements, as `@genoacms/contracts/storage` declares it. How an adapter is
shaped and registered is under [adapters](/guide/adapters).

## Concurrent writes

The only write an object store offers is *replace the whole object*. Two writers who both read an
object and both write it back produce a **lost update**: the second silently erases the first, and
nothing records that it happened. GenoaCMS stores mutable documents — page trees, component
definitions, its own manifests — this way, so the contract addresses it directly.

### Version tokens

`getObject` returns a `version` alongside the data, and `uploadObject` can require it:

```ts
const { data, version } = await getObject(reference)
// ...modify...
await uploadObject(reference, updated, { ifVersion: version })
```

If the object changed after it was read, the write is refused rather than applied. `ifAbsent: true`
is the other form — write only if the object does not exist, which lets any number of racing callers
create something while exactly one succeeds.

A refused write raises `PreconditionFailedError`:

```ts
import { isPreconditionFailed } from '@genoacms/contracts/storage'

try {
  await uploadObject(reference, updated, { ifVersion: version })
} catch (error) {
  if (!isPreconditionFailed(error)) throw error
  // Someone else wrote first. Re-read and decide.
}
```

:::caution[Do not retry blindly]
A rejected conditional write means someone else's change is now in the object. Replaying the write
over it reintroduces the lost update the condition existed to prevent. Re-read, and where a person
authored the change, tell them there is a conflict.
:::

:::note[The token is opaque]
`ObjectVersion` is a GCS generation on one adapter and an S3 etag on another. It is not a number, a
timestamp or an ordering — it may only be handed back to `uploadObject`. Code that compares or sorts
versions works against one provider and fails subtly against the next.

`version` may be absent when an adapter cannot supply one. That removes the ability to write
conditionally against that object; it does not make the read invalid.
:::

### There are no transactions

Object storage provides **no cross-object atomicity**. Neither S3, GCS nor MinIO exposes an API that
commits several objects together or rolls them back, and nothing above the adapter can supply the
guarantee — a sequence of writes can always be interrupted part-way.

GenoaCMS therefore does not offer a transaction API. An interface named for a guarantee it cannot
provide is worse than its absence, because callers rely on the name. Where several objects must
change together, design so that each write is independently valid, and use `ifVersion` to detect
that the world moved underneath you.

## Types

@include ../../../../../../contracts/src/storage/types.d.ts

## Adapter

@include ../../../../../../contracts/src/storage/adapter.d.ts

`create` receives the buckets bound to the provider as `ctx.resources`; a call naming any other
bucket is refused.

## Errors

@include ../../../../../../contracts/src/storage/index.d.ts
