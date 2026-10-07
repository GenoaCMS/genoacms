---
title: Introduction
---

GenoaCMS is a headless content management system written with portability and scalability in mind.

You deploy it onto infrastructure you already run, and it gives your team one administration
interface over what is already there:

- **Your database.** Collections describe the tables your project already has, and people browse and edit their documents.
- **Your storage.** People browse your buckets, upload, move and delete files and directories, and share signed links to them.
- **Components and pages**, when you want them. They are described [below](#Components--signed-pages,-in-any-language).

Each of these stands on its own. A project can use GenoaCMS only to edit its database, or only to
manage its files. GenoaCMS has no front end of its own: your applications keep reading the database
and the buckets as they do today.

## Adapters: the CMS adapts, not your infrastructure

GenoaCMS uses up to six services, and each one is reached through an adapter:

| Service | For example |
| :--- | :--- |
| Storage | Cloud Storage, S3, MinIO |
| Database | Firestore, DynamoDB, PostgreSQL |
| Authentication | Firebase Authentication or Identity Platform, a fixed list of users |
| Secrets | Secret Manager, Secrets Manager |
| Deployment | Cloud Run functions, Lambda, a plain Node server |
| Languages, for dynamic components | TypeScript |

One config names an adapter for each service, and a service can have several providers at once.
Each bucket and each database names the provider that serves it, so one instance can keep its files
in Cloud Storage and its content in PostgreSQL:

```ts
import { defineConfig, storageProvider, databaseProvider, secret } from '@genoacms/config'

export default defineConfig({
  storage: {
    providers: { gcs: storageProvider('@genoacms/adapter-gcp/storage', { projectId: 'my-project' }) },
    buckets: { 'my-project-cms': { provider: 'gcs' } },
    defaultBucket: 'my-project-cms'
  },
  database: {
    providers: {
      postgres: databaseProvider('@genoacms/adapter-postgres', {
        host: 'db.internal',
        database: 'shop',
        user: 'genoacms',
        password: secret('POSTGRES_PASSWORD')
      })
    },
    databases: { shop: { provider: 'postgres', collections } }
  },
  // authentication, secrets, languages, deployment, authorization, security
})
```

The [adapters](/guide/adapters/) page lists every adapter GenoaCMS ships. When none fits, you write
your own against the contracts in `@genoacms/contracts`. That package is the only one an adapter
depends on. Complete configs for Google Cloud, AWS and a self-hosted setup are in the
[examples](/guide/config/examples/).

## What stays yours

- **Your data.** Collections describe the tables that already exist, and storage works on your existing buckets. GenoaCMS edits both in place, and nothing is migrated into a format of its own.
- **Your infrastructure.** GenoaCMS runs in your cloud account or on your own server. There is no hosted service, no account to create and no vendor API to call.
- **Your credentials.** A config refers to credentials with `secret()` or `env()`, and they are read from your own secret manager when the server runs. They are never written into the build. See [secrets](/guide/config/secrets/).

## Components: signed pages, in any language

On top of the database and storage, GenoaCMS can compose pages from components and publish them.
Everything published this way is signed, and your application verifies it before rendering, so a
page altered in storage or on the way is refused rather than shown.

A component is one of two kinds:

- **Prebuilt.** The code lives in your application, written in its own language and framework. The CMS holds only a description of what the component accepts, so editors can place it on a page and fill it in, and your application supplies the code by name when it renders.
- **Dynamic.** The code is written in the CMS, after your application has shipped. A [language adapter](/guide/language-adapters/) checks it against that language's rules and compiles it, and the compiled code is signed and published with the page. `@genoacms/language-adapter-ts` ships today. An adapter for another language, even C, plugs in the same way.

Pages are rendered by a client SDK in your application. `@genoacms/sdk` verifies published pages,
runs their dynamic components and calls your prebuilt ones, with React, Svelte, Vue or no framework
at all. See [rendering pages in your app](/guide/consumer/). A client SDK for another platform needs
only the root public key and a way to read the published files.

## Domain of use

It is designed to be used in small to medium sized projects, where tight integration with the rest of the system is a benefit.

GenoaCMS is suitable choice for:

- Managing internal data of information systems
- Creating a blog or a website
- Manipulating data for a mobile application

GenoaCMS is not an end-to-end website builder like WordPress. It manages and publishes content.
Rendering it is the job of your application, so a project that wants one product to host, theme and
serve the site has to write that application first.

## The name

A genoa is a large headsail. It is not a boat of its own: it is set on the mast a sailboat already
has, and it works alongside the mainsail that is already up.

GenoaCMS is meant to be added the same way:

- **The mast** is the cloud infrastructure you already run on.
- **The mainsail** is the project already running on that infrastructure, with its own database and storage.
- **The genoa** is GenoaCMS, added later on the existing mast.

GenoaCMS doesn't bring its own infrastructure. Adapters connect it to the storage and databases your
project already uses. Collections describe the data that is already there, so it can be edited in
place. That is why `genoa init` creates `genoa.config/collections.ts`: telling GenoaCMS about your
existing data is the first thing you do with it.

## Next steps

- [Concepts](/guide/concepts/): the terms these docs use, defined.
- [Getting started](/guide/getting-started/): set a project up with `genoa init`, and run it.
- [Configuration](/guide/config/structure/): what a config holds.
- [Adapters](/guide/adapters/): the adapters that ship, and how to write one.
- [Rendering pages in your app](/guide/consumer/): the consumer side.
