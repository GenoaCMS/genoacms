---
title: Adapters
---

An adapter is the piece that lets GenoaCMS talk to one provider's implementation of a service —
Google Cloud Storage rather than S3, Firestore rather than Postgres. The CMS depends on the service
contract; the adapter satisfies it.

The point is that the CMS adapts, not your infrastructure. Adapters are configured per service in
[`genoa.config`](/guide/config/structure), and several providers of the same service can be
configured at once: a bucket names the storage provider it belongs to, a database names its own.

## Which services have adapters

| Service | What the adapter provides | Reference |
| :--- | :--- | :--- |
| Authentication | Verifying a credential and returning an `Identity` | [Authentication](/reference/cloudabstraction/authentication/) |
| Database | Documents and collections | [Database](/reference/cloudabstraction/database/) |
| Storage | Objects, directories and signed URLs | [Storage](/reference/cloudabstraction/storage/) |
| Secrets | Reading and writing secret material | [Secrets](/reference/cloudabstraction/secrets/) |
| Deployment | Publishing the built site | [Deployment](/reference/cloudabstraction/deployment/) |

Packages GenoaCMS ships: `@genoacms/adapter-gcp` (storage, database, secrets, deployment),
`@genoacms/adapter-node` (local deployment), `@genoacms/adapter-secrets-env` (secrets from the
environment, for development), and `@genoacms/authentication-adapter-array` (a fixed list of users,
for development).

## What has no adapter, and why

**Authorization has none.** There is no provider to register and no adapter to write: roles,
permissions and assignments are a core module of GenoaCMS, and their data lives in your own bucket
as signed documents.

This is a deliberate boundary rather than an omission. Authentication is delegable because *"who are
you?"* has interchangeable answers — one identity provider can stand in for another. *"What may you
do here?"* does not: permissions are defined over GenoaCMS's own resources, and no external system
can enumerate a bucket the CMS knows about or decide what `pages:publish` means. An adapter for it
would be an interface with exactly one possible implementation.

The **secrets** service exists for the opposite reason: secret storage genuinely is interchangeable,
and the key material must not sit in the primary bucket beside the content it protects.

## Writing one

Implement the service's adapter contract from `@genoacms/cloudabstraction` — the
[reference pages](/reference/cloudabstraction/config/) give the exact shape per service — and export
it from a package. A provider entry in `genoa.config` then names it:

```js
{
  name: 'myStorageProvider',
  adapterPath: '@my-org/adapter-thing/storage',
  adapter: import('@my-org/adapter-thing/storage'),
  // provider-specific settings, e.g. credentials, region
}
```

`adapterPath` is the string GenoaCMS matches a provider by; `adapter` is the module itself, imported
lazily so an unused provider costs nothing at boot.

:::note[Adapters are Tier-1 configuration]
Nothing at runtime can change which adapter a service uses. Adapter declarations are immutable once
deployed, so an administrator cannot repoint storage at another bucket from inside the CMS — see
[configuration tiers](/guide/config/structure).
:::
