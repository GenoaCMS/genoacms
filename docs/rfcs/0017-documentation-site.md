---
type: rfc
number: 17
title: Documentation site
status: implemented
commits: [4cf1e0b, d7a12f0]
depends: [16, 28, 30, 32]
architecture: []
changes: []
commit-subject: "docs(site): document the config, adapters, secrets, CLI and contracts as they are, with example configs"
---

# RFC-0017: Documentation site

## Summary

The pages of `packages/docs` that describe configuration, adapters, secrets, the CLI and the service
contracts still describe the system before the configuration redesign (`configuration.md` F8): a
`genoa.config/index.js` typed by `@genoacms/cloudabstraction`, providers as arrays of
`{ name, adapter: import(…) }`, `adapterPath`, `npx @genoacms/cli run`, secrets in `.env`, and an
authentication adapter that answers `Identity | null`. None of it works today. The site builds without
a warning, and its GitHub Pages workflow publishes only when `packages/docs` changes, so the drift was
invisible.

*Amended 2026-10-04.* The first draft predated RFC-0018 to RFC-0032 and the split of
`configuration.md` into `host.md`, `secrets.md`, `build.md` and `contracts/adapter-model.md`. Its
critique named the cause of the drift: nothing checks that the site's code examples are true. The
author chose example configs beside core's own, checked in CI, over a harness that extracts code
blocks (author, 2026-10-04): GCP, AWS and self-hosted.

This RFC:

1. adds three example configs to `packages/core/genoa.config/`, `gcp.ts`, `aws.ts` and `self-hosted.ts`, type-checked in CI's build step and loaded through the real loader in core's unit tests;
2. embeds files into pages at build time with an `@include` line, so a page shows a config exactly as committed, highlighted like any code block;
3. rewrites the configuration, adapters, getting-started and CLI guides, adds a secrets page and an examples page, and adds sign-in across providers and session revalidation to the sessions guide;
4. moves the reference from `/reference/cloudabstraction/*` to `/reference/contracts/*` and `/reference/config/`, at the contracts' current types;
5. points the site's GitHub link at `GenoaCMS/genoacms`.

## Files

**Modify or create only.** Pages are under `packages/docs/src/routes/`.

| File | Change |
| :-- | :-- |
| `packages/core/genoa.config/gcp.ts`, `aws.ts`, `self-hosted.ts` | create (§Specification, *Example configs*) |
| `packages/core/genoa.config/tsconfig.json` | add the three to `files`; it type-checks `test.ts` and `e2e.ts` in CI's build step since `9aa4277` |
| `packages/core/package.json`, `pnpm-lock.yaml` | dev dependencies `@genoacms/adapter-aws`, `@genoacms/adapter-minio`, `@genoacms/adapter-postgres`, each `workspace:^` |
| `packages/core/src/lib/config/exampleConfigs.test.ts` | create (§Tests) |
| `packages/docs/vite.config.ts` | the include plugin; the navbar, the sidebar and `github`; the highlighter's languages |
| `packages/docs/src/routes/+page.md` | its GitHub link points at `GenoaCMS/genoacms` |
| `.github/workflows/docs.yml` | `packages/core/genoa.config/**` added to the push `paths` |
| `guide/getting-started/+page.md`, `guide/config/structure/+page.md`, `guide/config/providers/+page.md`, `guide/config/services/+page.md`, `guide/adapters/+page.md`, `guide/cli/+page.md` | rewrite (§Specification, *Pages*) |
| `guide/config/secrets/+page.md`, `guide/config/examples/+page.md` | create |
| `guide/sessions/+page.md`, `guide/language-adapters/+page.md`, `reference/sdk/attributes/+page.md` | modify |
| `reference/cloudabstraction/{authentication,database,deployment,secrets,storage}/+page.md` | `git mv` to `reference/contracts/<same>/+page.md`, then rewrite |
| `reference/cloudabstraction/config/+page.md` | `git mv` to `reference/config/+page.md`, then rewrite |

## Specification

No Specification statement changes. The site is user documentation, which no architecture document
specifies; it follows the documents below, and where it disagrees with one, the document is right.

| Subject | Source of truth |
| :-- | :-- |
| config files, lookup, the authoring helpers, `Config` | `configuration.md` *Types: the config and the manifest*, *Config files per environment*, U12; `packages/config/src/config.ts` |
| references, the bootstrap rule, the development store, rotation | `secrets.md` |
| the build, the artifact, targets, the lifecycle, the `GENOA_*` environment | `build.md` |
| descriptors, runtimes, the registry | `contracts/adapter-model.md` |
| authentication | `contracts/authentication.md` AUTHN-1 to AUTHN-7 |
| the CLI | `cli.md` CLI-1 to CLI-19 |
| GCP and AWS options, IAM, behavior | `adapter-gcp/`, `adapter-aws/` |

### Example configs

Each file follows `development.ts`'s shape: the `@genoacms/config` helpers, one `import type {}` per
adapter specifier it names so the registry types its options, and the shared modules beside it
(`collections.js`, `authorization.ts`, `security.ts`, `languages.ts`). Each holds no credential,
no `inline()`, and no comment except one doc comment on the default export, which names the setting
and the command that uses the file. Placeholder names are `my-project` (GCP) and `my-company` (AWS).

| File | Providers | Loads as |
| :-- | :-- | :-- |
| `gcp.ts` | authentication `firebase`: `@genoacms/adapter-gcp/authentication/identity-platform` `{ projectId }`; secrets `secret-manager`: `@genoacms/adapter-gcp/secrets` `{ projectId }`; storage `gcs`: `@genoacms/adapter-gcp/storage` `{ projectId }`, buckets `my-project-cms` (default) and `my-project-public`; database `firestore`: `@genoacms/adapter-gcp/database` `{ projectId, databaseId: '(default)' }`, database `content`; target `gcp`: `@genoacms/adapter-gcp/deployment` `{ projectId, region: 'europe-west3', memory: '1Gi', serviceAccount: 'genoacms@my-project.iam.gserviceaccount.com' }` | production |
| `aws.ts` | authentication `admins`: `@genoacms/authentication-adapter-array` `{ credentials: secret('GENOACMS_ADMIN_CREDENTIALS') }`; secrets `secrets-manager`: `@genoacms/adapter-aws/secrets` `{ region: 'eu-central-1' }`; storage `s3`: `@genoacms/adapter-aws/storage` `{ region }`, buckets `my-company-cms` (default) and `my-company-public`; database `dynamodb`: `@genoacms/adapter-aws/database` `{ region }`, database `content`; target `aws`: `@genoacms/adapter-aws/deployment` `{ region, role: 'arn:aws:iam::123456789012:role/genoacms', artifactBucket: 'my-company-deployments' }` | production |
| `self-hosted.ts` | authentication `admins`: as `aws.ts`; secrets `local`: `@genoacms/adapter-secrets-env` `{}`; storage `minio`: `@genoacms/adapter-minio` `{ endPoint: 'localhost', port: 9000, useSSL: false, accessKey: secret('MINIO_ACCESS_KEY'), secretKey: secret('MINIO_SECRET_KEY') }`, buckets `cms` (default) and `public`; database `postgres`: `@genoacms/adapter-postgres` `{ host: 'localhost', database: 'genoacms', user: 'genoacms', password: secret('POSTGRES_PASSWORD') }`, database `content`; target `node`: `@genoacms/adapter-node` `{ outDir: 'build' }` | development only: `adapter-secrets-env` is `developmentOnly` (`secrets.md` *Development store*), and no other secret store runs without a cloud account |

All three set `cookieName: '__session'` and pass `languages`, `authorization` and `security` through.

### The include plugin

`vite.config.ts` defines a Vite plugin, listed before `sveltepress(…)`, with `enforce: 'pre'`. Its
`transform(src, id)` acts only on ids ending in `+page.md`. It replaces every line that is exactly
`@include <path>` with a fenced block whose language is the file's extension (`ts`, `js`, `json`),
holding the file's contents. `<path>` is relative to the page's directory. A missing file fails the
build with `include: <path> not found (in <page>)`. Spiked 2026-10-04: sveltepress's highlighter then
renders the block like a written one.

The site therefore shows a config only by including it, and never copies one into a page.

*Amended 2026-10-04, found implementing this RFC.* sveltepress has an import of its own,
`@code(<path>)`, but it renders nothing for a missing file, so a renamed config would vanish from a
page without failing the build; the plugin stays. The highlighter loads only `svelte`, `sh`, `js`,
`html`, `ts`, `md`, `css` and `scss` by default, and a block in another language reaches Svelte
unescaped, so a `json` block with braces fails the build: the theme's `highlighter.languages` adds
`bash` and `json`. Prerendering already fails on a link or an anchor that does not resolve.

### Pages

Each page's code examples are included example configs, or fragments of a config that are consistent
with them. No page names `cloudabstraction`, `adapterPath`, `getProvider`, `genoaConfig`,
`languageAdapters`, `GENOA_BUILD`, `GENOA_CONFIG_PATH`, `DEPLOYMENT_PROVIDER` or
`npx @genoacms/cli run`. Pages not listed are unchanged.

1. **getting-started.** `pnpm dlx @genoacms/cli init` and what it asks (CLI-12) and writes (CLI-13); the six files of `genoa.config/`; filling the options, with a link to the examples page; describing data that already exists in `collections.ts`, linking the introduction's "The name" section; the administrators' credentials in `.genoacms/secrets.env` as one line of JSON, as `development.ts`'s template says; `genoa dev`; then `genoa deploy --config genoa.config/production.ts`. The project tree shows `.genoacms/` and no `.env`.
2. **config/structure.** The "two tiers" section stays as it is, except that the `security` list names all eight fields of `SecurityConfig`. The rest is rewritten: one file per environment; the lookup (`genoa.config.{ts,mts,js,mjs}`, then `genoa.config/development.{ts,mts,js,mjs}`; `genoa.config/index.*` is not looked up; a production config is always named); config as data: it may import anything that evaluates to data, and names adapters by specifier, never by import; `defineConfig` and the `*Provider()` helpers; one full config, `@include ../../../../../../core/genoa.config/self-hosted.ts`, with a link to the examples page for the others.
3. **config/providers.** The helpers `storageProvider`, `databaseProvider`, `authenticationProvider`, `secretsProvider`, `languageProvider`, `deploymentTarget`; providers as records keyed by name, so names are unique; buckets and databases naming a provider by key, with a type error for a key that does not exist and `config/unknown-provider` from the loader; two providers of one adapter shown as a fragment.
4. **config/services.** One section per stanza: `authentication` (providers tried in key order, `cookieName`, the existing `__session` and no-session-secret notes), `database` (`databases` keyed by name, `CollectionReference` with `primaryKey: { key, schema }` and `JsonSchema`, the custom schemas from `@genoacms/contracts/schemas`), `storage` (`buckets`, `defaultBucket`, `pathDelimiter`, default `'|->'`), `secrets` (exactly one provider; the existing stored-keys, root-key and concurrent-start notes stay), `languages` (keyed by the language a component records), `deployment` (`targets`, `default`, optional in a config used only by the dev server), `authorization` and `security` (all eight fields with their defaults). It ends with a table of the loader's error codes and when each is raised: `config/not-found`, `config/evaluation-failed`, `config/not-an-object`, `config/missing-stanza`, `config/invalid-provider-entry`, `config/descriptor-not-found`, `config/descriptor-invalid`, `config/kind-mismatch`, `config/invalid-options`, `config/not-serializable`, `config/bare-secret`, `config/misplaced-reference`, `config/bootstrap-secret`, `config/invalid-secret-key`, `config/secrets-provider-count`, `config/unknown-provider`, `config/unknown-bucket`, `config/integer-key`, `config/development-only`, `config/inline` (a warning), `config/inline-forbidden`, and at build time `config/unknown-target` and `config/no-deployment-target`.
5. **config/secrets**, new. `secret()`, `env()` and `inline()`; where each is resolved and what may hold one (`secrets.md` *Where a reference is resolved*), including that deployment options never enter the build; the bootstrap rule (the secrets provider's own options take `env()` or `inline()` only); Application Default Credentials and the SDK's default chain as the production form; `inline()` warns, and `--no-inline` refuses it; the development store `.genoacms/secrets.env`; rotation takes effect on restart (`secrets.md` *Caching and rotation*).
6. **config/examples**, new. One section per example config, each with `@include ../../../../../../core/genoa.config/<file>`, what it needs before it runs (GCP: the runtime and operator IAM of `adapter-gcp/README.md` *IAM*, Firebase Authentication enabled; AWS: the identities of `adapter-aws/README.md` *IAM*, the artifact bucket, `GENOACMS_ADMIN_CREDENTIALS` in Secrets Manager; self-hosted: a MinIO and a PostgreSQL server, the three secrets in `.genoacms/secrets.env`), and the command that uses it. The self-hosted section says plainly that it is a development config, and why. A note says the files are core's own, checked in CI, and links them on GitHub.
7. **adapters.** Descriptor and runtime, and why the descriptor is SDK-free (`contracts/adapter-model.md`); `defineStorageAdapter` and the other `define*` helpers; `secretOptions`, `developmentOnly`, `validate`; registry augmentation (`declare module '@genoacms/contracts' { interface StorageAdapters { … } }`); a complete minimal third-party storage adapter: descriptor, runtime with `create(options, ctx)`, and the `package.json` `exports` map; the deployment descriptor with `svelteKitAdapter`, `svelteKitOptions`, `procedure` and `DeployContext`; running `@genoacms/conformance`. The shipped packages: `adapter-gcp` (storage, database, secrets, Identity Platform authentication, deployment), `adapter-aws` (storage, database, secrets, deployment), `adapter-minio`, `adapter-postgres`, `adapter-node`, `adapter-secrets-env`, `authentication-adapter-array`, `language-adapter-ts`. The section on what has no adapter stays.
8. **cli.** Every command of CLI-2 with its default mode; `-c`/`--config`, `-m`/`--mode` with `dev` and `prod`, `--no-inline`, `-h`/`--help`, `-v`/`--version`; `genoa build [target]` and what it writes (`.genoacms/build`, its `package.json`); `genoa deploy [target]`, which resolves the target's secrets on the operator's machine through the configured store; `database` deletes dynamic collections (CLI-10). The "Composing roles" and "Key rotation" sections stay, with `npx @genoacms/cli rotate-root` replaced by `genoa rotate-root --config genoa.config/production.ts`. The CLI's link points at the `packages/cli` directory of `GenoaCMS/genoacms`.
9. **sessions.** A section on signing in across providers (AUTHN-5: one at a time, in key order; what moves on to the next; the three messages a user sees) and one on revalidation (AUTHN-6, AUTHN-7: each refresh asks the provider that admitted the session; a user deleted or disabled there is signed out at the next refresh; a provider that fails leaves the session as it is). Nothing else changes.
10. **language-adapters.** "Registering one" shows the `languages` stanza with `languageProvider('@genoacms/language-adapter-ts', { target: 'es2020' })`, keyed by language, and its explanation of the dynamic import is removed. The first paragraph's `@genoacms/cloudabstraction` becomes `@genoacms/contracts`.
11. **reference/contracts/***. Each page gives the adapter interface of its contract as `@genoacms/contracts` declares it, by including the contract's own declaration files (`packages/contracts/src/<service>/*.d.ts`, and `adapter.d.ts` for deployment); the moved pages had retyped them and drifted, a `QueryParams.order` the contract does not have among them: authentication with `Rejection`, `RejectionReason` and `getIdentity` (AUTHN-2 to AUTHN-4); storage with all ten methods, `moveObject`, `deleteDirectory` and `moveDirectory` among them, and `isPreconditionFailed` from `@genoacms/contracts/storage`; database, with `JsonSchema` for a collection's `schema` and `primaryKey.schema`; secrets, with key names and `assertValidSecretKey` from `@genoacms/contracts/secrets`, the GCP row saying superseded versions are destroyed (`adapter-gcp/secrets.md`), and credentials optional under Application Default Credentials; deployment as `DeploymentDescriptor`, `DeployContext` and `DeployProcedure`. Every `declare module '@genoacms/adapter-*/…'` block and every `*Provider` type is removed, and each page links the adapters guide.
12. **reference/config.** `defineConfig`, the helpers and references, `Config`, `AuthorizationConfig`, `SecurityConfig`, `LoadOptions`, `Manifest` and `RuntimeManifest`; `createHost` in one paragraph, for tooling authors; the `genoa()` Vite plugin and the `GENOA_*` environment (`build.md`).
13. **reference/sdk/attributes.** `@genoacms/cloudabstraction` becomes `@genoacms/contracts`.

### Navigation

The navbar's Reference links to `/reference/config/`. The guide's Configuration group lists Config
structure, Providers, Services, Secrets, Examples and Adapters. The reference sidebar holds Client SDK
as it is, then **Contracts** (Authentication, Database, Deployment, Secrets, Storage), then **Config**.
`github` is `https://github.com/GenoaCMS/genoacms`.

## Non-goals

- No change to `guide/authorization`, `guide/signing-keys`, `guide/storage-layout`, `guide/consumer`, `guide/introduction` or `reference/sdk/documents`.
- No theme change and no new dependency; the highlighter's language list is configuration of the existing theme. `src/lib/ExternalFile.md`, which no page uses, stays.
- No internal mechanism on the site: scanner internals, host caching, the vendoring of local packages.
- No change to `development.ts`, `production.ts`, `test.ts` or `e2e.ts`, and no redirect from the old `/reference/cloudabstraction/*` routes.

## Tests

- `packages/core/src/lib/config/exampleConfigs.test.ts` (unit) › `the example configs the documentation site shows › loads gcp.ts as a production config`: given `genoa.config/gcp.ts`, when `loadConfig` loads it in production mode with `forbidInline: true`, then it resolves to a manifest whose `mode` is `production`.
- the same file › `loads aws.ts as a production config`: likewise for `aws.ts`.
- the same file › `loads self-hosted.ts as a development config, and refuses it in production`: given `self-hosted.ts`, when it is loaded in development mode, then it resolves with `mode: 'development'`; when it is loaded in production mode, then it rejects with code `config/invalid`.

The tests carry no statement ID: they check the examples, which no statement specifies. Each run
validates every provider's options through its adapter's own `validate`, and the build step's type
check (`9aa4277`) checks them against the registry's types.

## Steps

1. Baseline: `pnpm --filter @genoacms/docs run build` succeeds; `check:config` exists and passes.
2. Add the dev dependencies, the three example configs and the test, and extend `genoa.config/tsconfig.json`. Run the first two commands of §Verification. Commit: `feat(core): example configs for GCP, AWS and self-hosting`.
3. Add the include plugin and the navigation to `vite.config.ts`. Move the reference pages with `git mv`.
4. Write the pages, in the order of §Specification, *Pages*.
5. Run §Verification. Commit the site with this RFC's `commit-subject`.

## Verification

```bash
pnpm -r --no-bail --filter '!@genoacms/core' run build && pnpm --filter @genoacms/core run check:config
pnpm --filter @genoacms/core exec vitest run src/lib/config/exampleConfigs.test.ts
```

Expected: both exit 0; three tests pass.

```bash
pnpm --filter @genoacms/docs run build
grep -rn "cloudabstraction\|adapterPath\|getProvider\|genoaConfig\|languageAdapters\|GENOA_BUILD\|GENOA_CONFIG_PATH\|DEPLOYMENT_PROVIDER\|npx @genoacms/cli run\|GenoaCMS/core\|GenoaCMS/cli" packages/docs/src packages/docs/vite.config.ts || echo "no stale names: ok"
grep -c 'shiki' packages/docs/dist/guide/config/examples.html
```

Expected: the build succeeds; the grep prints `no stale names: ok`; the examples page holds at least
three highlighted blocks.

```bash
echo '@include ./missing.ts' >> packages/docs/src/routes/guide/config/examples/+page.md
pnpm --filter @genoacms/docs run build; echo "exit $?"
git checkout packages/docs/src/routes/guide/config/examples/+page.md
```

Expected: the build fails with `include: ./missing.ts not found`.

A reviewer reads each rewritten page against its source of truth in §Specification and records any
mismatch; there is no automated check of prose.

## Critique

**Pros**
- Every config the site shows is a file that CI type-checks and loads; an adapter option renamed or removed breaks the build, not a reader.
- The examples are also core's: `genoa dev --config genoa.config/self-hosted.ts` runs core against MinIO and Postgres.
- Writing the examples already found three defects nothing else had: core's collections and `init`'s example declared `primaryKey` as a bare string, which the AWS and Postgres adapters refuse; the contract typed schemas with ajv's `JSONSchemaType<any>`, which refuses every ordinary schema (both fixed without an RFC, ``f85e6ae`, `022de8b``); and self-hosting has no production secret store.

**Cons & trade-offs**
- Core gains three dev dependencies only for the examples' types.
- Fragments in prose (two providers of one adapter, a minimal third-party adapter, the reference's interfaces) are still unchecked text.
- Moving the reference breaks inbound links to `/reference/cloudabstraction/*`. Nothing is released as stable, so few exist.
- `gcp.ts` repeats much of core's `production.ts`, which signs in with Identity Platform since RFC-0032; the example exists because `production.ts` imports a gitignored credential file and cannot be checked in CI.

**Blindspots & missed edge cases**
- The loader test does not resolve secrets or reach a provider, so an example that loads may still fail at runtime, for instance with IAM the page leaves out.
- The include plugin acts on `+page.md` only; an `@include` in a layout or a component stays literal.
- The Pages workflow republishes on a change under `packages/core/genoa.config/`, but not when an adapter's option types change; the example then fails CI first, and the fix republishes.
- Self-hosting has no production secret store; the examples page states the limit and no RFC addresses it.
- The loader checks providers, not collections: a project's plain-JavaScript `collections.js` with a malformed collection still loads. A general config checker is left to a later RFC.
