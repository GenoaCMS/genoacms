# GenoaCMS

Monorepo for GenoaCMS: the CMS core, the cloud abstraction layer, and the adapters
that implement that abstraction for individual providers.

## Layout

| Package                                                                                   | Published as                                       | Role                                                          |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| [`packages/cloudAbstraction`](packages/cloudAbstraction)                                     | `@genoacms/cloudabstraction`                        | Provider-agnostic contracts for storage, database, auth, deployment. Every adapter implements these. |
| [`packages/core`](packages/core)                                                             | `@genoacms/core`                                    | The SvelteKit CMS application                                  |
| [`packages/cli`](packages/cli)                                                               | `@genoacms/cli`                                     | Project scaffolding and setup                                  |
| [`packages/adapter-gcp`](packages/adapter-gcp)                                               | `@genoacms/adapter-gcp`                             | Storage / database / auth / deployment on Google Cloud         |
| [`packages/adapter-aws`](packages/adapter-aws)                                               | `@genoacms/adapter-aws`                             | Storage / database / auth / deployment on AWS                  |
| [`packages/adapter-minio`](packages/adapter-minio)                                           | `@genoacms/adapter-minio`                           | Storage on MinIO                                               |
| [`packages/adapter-postgres`](packages/adapter-postgres)                                     | `@genoacms/adapter-postgres`                        | Database on PostgreSQL                                         |
| [`packages/adapter-node`](packages/adapter-node)                                             | `@genoacms/adapter-node`                            | Deployment to a plain Node server                              |
| [`packages/authentication-adapter-array`](packages/authentication-adapter-array)             | `@genoacms/authentication-adapter-array`            | Authentication from an in-config credential array              |
| [`packages/authorization-adapter-array`](packages/authorization-adapter-array)               | `@genoacms/authorization-adapter-array`             | Authorization from an in-config user array                     |
| [`packages/sveltekit-adapter-cloud-run-functions`](packages/sveltekit-adapter-cloud-run-functions) | `@genoacms/sveltekit-adapter-cloud-run-functions` | SvelteKit build adapter targeting Cloud Run Functions          |
| [`packages/docs`](packages/docs)                                                             | — (private)                                         | Documentation site, deployed to GitHub Pages                   |

## Getting started

Requires Node 20+ and [pnpm](https://pnpm.io) (pinned via `packageManager`; `corepack enable` picks up the right version).

```bash
pnpm install     # installs every package and links them together
pnpm dev         # runs the core CMS
pnpm docs:dev    # runs the documentation site
```

Root scripts (`build`, `test`, `lint`, `check`) fan out across every package that
defines them, in dependency order. To work in a single package, filter:

```bash
pnpm --filter @genoacms/adapter-gcp run build
pnpm --filter @genoacms/core... run build   # the package and everything it depends on
```

## Internal dependencies

Packages depend on each other through the `workspace:^` protocol, e.g.:

```json
"@genoacms/cloudabstraction": "workspace:^"
```

pnpm links these to the local source, so a change in `cloudAbstraction` is visible
to every adapter immediately — no publish, no version bump, no drift between what
an adapter is developed against and what it declares. At publish time pnpm rewrites
`workspace:^` to the real caret range (`^0.8.11`), so consumers on npm see a normal
dependency. Never hand-write a version number for an internal dependency.

## Releasing

Versioning and publishing run on [Changesets](https://github.com/changesets/changesets).

1. Alongside your change, describe it: `pnpm changeset`. Pick the affected packages
   and the bump type; a Markdown file lands in `.changeset/`. Commit it with the change.
2. On merge to `main`, the Release workflow opens a **Version Packages** PR that
   applies every pending changeset — bumping versions, updating internal dependency
   ranges, and writing changelogs.
3. Merging that PR publishes the changed packages to npm with provenance.

Packages that only changed because an internal dependency moved get a patch bump
automatically. `@genoacms/docs` is private and never published.

## CI

| Workflow                                     | Trigger                          | Does                                              |
| -------------------------------------------- | -------------------------------- | ------------------------------------------------- |
| [`ci.yml`](.github/workflows/ci.yml)           | push to `main`, pull requests    | install, lint, build, test across the workspace   |
| [`release.yml`](.github/workflows/release.yml) | push to `main`                   | Changesets version PR / npm publish               |
| [`docs.yml`](.github/workflows/docs.yml)       | push to `main` touching `packages/docs/**` | build and deploy the docs site to Pages |
