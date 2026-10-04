---
title: Getting started
---

GenoaCMS comes with a [CLI](/guide/cli), `genoa`, that sets a project up, runs it and deploys it. In
an empty directory or an existing Node project, run:

```bash
npx @genoacms/cli init
```

With pnpm, `pnpm dlx @genoacms/cli init` does the same. The commands below are written as `genoa`:
add the CLI to the project with `npm install -D @genoacms/cli` (or `pnpm add -D @genoacms/cli`) and
run them as `npx genoa …` (or `pnpm genoa …`), or keep running them through `npx @genoacms/cli …`.

## What `init` does

It asks two questions:

- **An adapter suite**: GCP, AWS, or none. The suite decides the storage, database, secrets and deployment adapters of the production config.
- **An authentication adapter**: the array adapter, a list of users held as a secret, or none.

It then installs `@genoacms/core`, `@genoacms/config`, `@genoacms/contracts`,
`@genoacms/adapter-secrets-env`, `@genoacms/adapter-node`, `@genoacms/language-adapter-ts` and the
packages you chose, writes `genoa.config/`, and adds `.genoacms/` to `.gitignore`:

```
project/
├── genoa.config/
│   ├── development.ts
│   ├── production.ts
│   ├── collections.ts
│   ├── authorization.ts
│   ├── security.ts
│   └── languages.ts
├── .genoacms/          created on first run: the development secrets and the build
├── node_modules/
└── package.json
```

`init` refuses to run where a config already exists, before writing anything.

## Fill in the options

`development.ts` and `production.ts` name the adapters you chose. Where an adapter's options are left
for you, a `TODO` marks them: the bucket and database your project already uses, a project ID, a
region. A `TODO` adapter specifier, left where you chose no suite, is refused when the config loads
until you replace it. The [example configs](/guide/config/examples) show every adapter's options
filled in.

## Describe the data you already have

GenoaCMS is set on infrastructure and data that already exist — see
[the name](/guide/introduction#The-name). `genoa.config/collections.ts` is where you tell it which
collections your database holds, and what their documents look like:

```ts
export const collections: CollectionReference[] = [
  {
    name: 'authors',
    primaryKey: { key: 'id', schema: { type: 'string' } },
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' }
      }
    }
  }
]
```

[Services](/guide/config/services#Database) describes every field.

## Run it locally

The development config signs administrators in from `GENOACMS_ADMIN_CREDENTIALS`, which it reads
from the development secrets store, `.genoacms/secrets.env`. Put one line of JSON there:

```
GENOACMS_ADMIN_CREDENTIALS=[{"email":"admin@example.com","password":"…","subject":"admin"}]
```

and give that subject a role in `genoa.config/authorization.ts`:

```ts
assignments: {
  admin: ['Administrator']
}
```

Then start GenoaCMS:

```bash
genoa dev
```

`genoa dev` finds `genoa.config/development.ts` on its own. Open the address it prints, and sign in.
On first start GenoaCMS generates its signing keys and writes them to the same store; there is
nothing else to set by hand.

## Deploy

Fill in `genoa.config/production.ts`: a real secrets store instead of `.genoacms/secrets.env`, which a
production build refuses, and the same administrators' credentials stored there. Then:

```bash
genoa deploy --config genoa.config/production.ts
```

A production config is never found by default; it is always named. The deployment target in the
config decides where GenoaCMS goes, and its credentials are used on your machine only. See
[secrets](/guide/config/secrets) for how production credentials work, and the
[CLI](/guide/cli) for every command.
