# `@genoacms/core`

The GenoaCMS application: the SvelteKit app that editors sign in to, with collections, storage,
components, pages, publication, authorization and agent access. It runs on the infrastructure you
already have, through adapters for each service.

Core is not imported as a library. A project installs it, describes itself in a config, and the
[`genoa` command](https://www.npmjs.com/package/@genoacms/cli) builds and runs core from that config.

## Getting started

```bash
npx @genoacms/cli init
```

`init` installs core, `@genoacms/config`, `@genoacms/contracts`, the development secrets store, the
Node target, the TypeScript language adapter and the adapters you choose, and writes
`genoa.config/`. It does not install the CLI itself; add it to the project, then run it with `npx`:

```bash
npm install -D @genoacms/cli
npx genoa dev                                          # locally, with genoa.config/development.ts
npx genoa deploy --config genoa.config/production.ts   # to the config's deployment target
```

The [getting started guide](https://genoacms.js.org/guide/getting-started/) walks through the config,
the first administrator and the first deploy.

## What core needs from your project

- **Node** `^22.17` or `>=24`. Older versions are not refused at install, and fail later.
- **A config** naming adapters for storage, database, secrets and authentication, and, to build, a
  deployment target; language adapters are optional. See [adapters](https://genoacms.js.org/guide/adapters/).
- **`@sveltejs/kit` 3**, which core declares as a peer dependency as well as a dependency; npm and
  pnpm install it for you.
- **A writable `node_modules`.** The build runs inside the installed core package and writes
  SvelteKit's and Vite's intermediate files there. A read-only `node_modules`, such as one baked into
  an image, fails the build.

`genoa build` writes a self-contained artifact to `.genoacms/build/`: the server, the client assets
and a generated `package.json` of exactly what the server imports. It holds no project source, no
config file and no deployment options.

## Versions

Core, the CLI, `@genoacms/config` and the adapters are released separately. See
[stability and versions](https://genoacms.js.org/guide/stability/) for which releases work together.

Development of core itself happens in the [monorepo](https://github.com/GenoaCMS/genoacms); its
`package.json` scripts are for that, not for projects that install core.
