---
title: Concepts
---

The terms the rest of these docs use, each defined in a few lines and linked to the page that covers
it in full. Read the first two sections before [getting started](/guide/getting-started/). The rest
can wait until a page uses them.

## Infrastructure

### Service

One kind of infrastructure GenoaCMS needs: **storage**, **database**, **authentication**, **secrets**,
**deployment**, and **languages** for dynamic components. GenoaCMS defines what each service must do,
and leaves how it is done to an adapter.

### Adapter

A package that implements one service for one platform, for example `@genoacms/adapter-gcp/storage`
for Cloud Storage or `@genoacms/adapter-postgres` for PostgreSQL. An adapter is written against the
contracts in `@genoacms/contracts` and depends on nothing else, so you can write your own. See
[adapters](/guide/adapters/).

### Adapter suite

The set of adapters `genoa init` picks for one platform: GCP or AWS. It is a starting point only, and
each service's adapter can be changed afterwards.

### Provider

One configured instance of an adapter: which adapter, and its options. Providers are named by a key
you choose, and a service may have several, even two of the same adapter. See
[providers](/guide/config/providers/).

### Deployment target

A provider of the deployment service. It decides how GenoaCMS is built and where it runs: Cloud Run
functions, Lambda or a plain Node server. `genoa deploy` uses it.

### Secret reference

How a config names a credential without holding it. `secret('KEY')` reads it from the secrets
provider and `env('VAR')` from an environment variable, both when the server starts using the
provider, never during the build. `inline(value)` writes the value into the build, visibly. See
[secrets](/guide/config/secrets/).

## Your data

### Bucket

A storage container that already exists in your storage provider, bound to the provider that serves
it. The **default bucket** also holds GenoaCMS's own data under `.genoacms/`, so it should be
private. See [what GenoaCMS stores](/guide/storage-layout/).

### Collection

A description of a table or collection that already exists in your database: its name, its primary
key, and a JSON Schema of its documents. GenoaCMS edits the documents in place and migrates
nothing. Collections live in `genoa.config/collections.ts`. See [services](/guide/config/services/).

## Users and permissions

### Subject

The stable identifier your authentication provider issues for a user. Every permission is granted to
a subject, never to an email address, because addresses change hands. See
[identity and sessions](/guide/sessions/).

### Permission, grant and role

A **permission** is one fixed action, such as `db:collection:write` or `pages:publish`. A **grant**
applies a permission to a resource: a bucket, a collection, or the whole instance. A **role** is a
named set of grants.

### Assignment

The roles a subject holds. A new instance needs at least one assignment in the config, or nobody can
administer it. See [roles and permissions](/guide/authorization/).

### Session

What a sign-in becomes: a short-lived access token and a longer-lived refresh token. GenoaCMS checks
the user again with the authentication provider at every refresh, so a disabled user loses access
when the access token expires, 15 minutes by default.

## Configuration

### Tier 1 and Tier 2

GenoaCMS is configured in two places. **Tier 1** is `genoa.config`, in your repository, changed by a
deployment. It is the only place adapters and credentials can be set. **Tier 2** is a set of signed
documents in the default bucket, changed by administrators at runtime. Tier 2 may add to what Tier 1
declares, never override it. See [configuration](/guide/config/structure/).

### Declaration and seed

Tier 1 holds two kinds of setting. A **declaration** (the `authorization` stanza: roles and
assignments) is re-read on every check, so deleting a line takes back what it granted. A **seed**
(the `security` stanza: token lifetimes, key rotation, component limits) only sets the values a new
instance starts from. Afterwards they are changed in the CMS.

## Pages and components

These matter only if you compose pages in GenoaCMS. Editing a database or a bucket needs none of
them.

### Component

A reusable building block of a page, with named, typed attributes that editors fill in. A component
is one of two kinds:

- **Prebuilt.** Its code lives in your application, in your application's own language and framework. GenoaCMS holds only a description of its attributes, and your application supplies the code by name when it renders.
- **Dynamic.** Its code is written in the CMS, after your application has shipped. A language adapter compiles it, and the compiled code is published with the page.

### Language adapter

The piece that checks and compiles dynamic components written in one language.
`@genoacms/language-adapter-ts` handles TypeScript. Prebuilt components need no language adapter.
See [adding a language](/guide/language-adapters/).

### Page

A tree of components with their attributes filled in. Editors compose it in the CMS, and publishing
it makes it readable by your applications.

### Publication

One released version of a component, written once and never changed. A published page pins the
exact publication of every component it uses, so a later change to a component does not alter a page
that was already published.

### Consumer

Your own application, the one that renders published pages. It is not a plugin and does not run inside
GenoaCMS. It reads the published files from storage and renders them with a client SDK.

### Client SDK

The library a consumer uses to read, verify and render pages. `@genoacms/sdk` is the JavaScript one.
See [rendering pages in your app](/guide/consumer/).

### Component limits (fuel)

The ceilings a dynamic component runs under, set by `security`: **fuel** is the number of loop
iterations and recursive branches per render, beside the maximum call depth and memory. They are
compiled into the component and signed with it, so a consumer can lower them and never raise them.

### Data bridge

The only way a dynamic component can reach the network. It is built into the signed component and
refuses every origin not listed in `security.fetchOrigins`, which by default lists none.

### Passthrough

The object a consumer hands to every dynamic component on a page: a date formatter, an icon set,
whatever your application chooses to grant. Nothing checks what you put in it, so it is your
security decision. Prebuilt components never receive it.

## Signing

### Signed document

A document stored with a signature over its content. Published pages, component publications and
GenoaCMS's own Tier-2 documents are signed, so a reader can tell them from anything else written to
the same bucket.

### Root trust anchor and root public key

The instance's top-level key pair. Its only job is to sign the key registry. Consumers embed the
**root public key** when they are built, which is why replacing the root means rebuilding every
consumer. Replacing it is `genoa rotate-root`. See [signing keys](/guide/signing-keys/).

### Key registry

The signed list of subordinate keys the instance currently uses, and of those it no longer trusts.
A consumer fetches it and checks it against the root public key.

### Subordinate key

A key that signs everything except the registry. Subordinate keys rotate on their own, every 90 days
by default, and no consumer notices. A leaked one is **revoked**, and everything it signed must be
signed again.
