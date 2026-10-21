# GenoaCMS

Monorepo for GenoaCMS: the CMS core, the service contracts, and the adapters
that implement them for individual providers.

GenoaCMS has run in production since 2024. See the [sites that use it](https://genoacms.js.org/in-production/).

## Layout

| Package                                                                                   | Published as                                       | Role                                                          |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| [`packages/contracts`](packages/contracts)                                                  | `@genoacms/contracts`                              | Provider-agnostic service contracts and adapter descriptor types. Every adapter implements these. |
| [`packages/config`](packages/config)                                                        | `@genoacms/config`                                 | Config authoring helpers, loader, host and build integration |
| [`packages/conformance`](packages/conformance)                                              | `@genoacms/conformance`                            | Test suites an adapter runs to prove it meets its service contract |
| [`packages/core`](packages/core)                                                             | `@genoacms/core`                                    | The SvelteKit CMS application                                  |
| [`packages/cli`](packages/cli)                                                               | `@genoacms/cli`                                     | Project scaffolding and setup                                  |
| [`packages/adapter-gcp`](packages/adapter-gcp)                                               | `@genoacms/adapter-gcp`                             | Storage / database / auth / secrets / deployment on Google Cloud         |
| [`packages/adapter-aws`](packages/adapter-aws)                                               | `@genoacms/adapter-aws`                             | Storage / database / secrets / deployment on AWS                  |
| [`packages/adapter-minio`](packages/adapter-minio)                                           | `@genoacms/adapter-minio`                           | Storage on MinIO                                               |
| [`packages/adapter-postgres`](packages/adapter-postgres)                                     | `@genoacms/adapter-postgres`                        | Database on PostgreSQL                                         |
| [`packages/adapter-node`](packages/adapter-node)                                             | `@genoacms/adapter-node`                            | Deployment to a plain Node server                              |
| [`packages/authentication-adapter-array`](packages/authentication-adapter-array)             | `@genoacms/authentication-adapter-array`            | Authentication from a fixed list of users held as a secret              |
| [`packages/sveltekit-adapter-cloud-run-functions`](packages/sveltekit-adapter-cloud-run-functions) | `@genoacms/sveltekit-adapter-cloud-run-functions` | SvelteKit build adapter targeting Cloud Run Functions          |
| [`packages/docs`](packages/docs)                                                             | — (private)                                         | Documentation site, deployed to GitHub Pages                   |

## Getting started

Requires Node `^20.19`, `^22.12` or `>=24`, and [pnpm](https://pnpm.io) (pinned via `packageManager`; `corepack enable` picks up the right version).

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
"@genoacms/contracts": "workspace:^"
```

pnpm links these to the local source, so a change in `contracts` is visible
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
| [`ci.yml`](.github/workflows/ci.yml)           | push to `main`, pull requests    | install, build, test across the workspace   |
| [`release.yml`](.github/workflows/release.yml) | push to `main`                   | Changesets version PR / npm publish               |
| [`docs.yml`](.github/workflows/docs.yml)       | push to `main` touching `packages/docs/**` | build and deploy the docs site to Pages |

## Contributing, security and license

GenoaCMS is maintained by one person. See [`CONTRIBUTING.md`](CONTRIBUTING.md) to report a bug or propose a
change, [`SECURITY.md`](SECURITY.md) to report a vulnerability, and
[Stability and versions](https://genoacms.js.org/guide/stability/) for which releases and adapter
combinations to use. Released under the [MIT License](LICENSE).
