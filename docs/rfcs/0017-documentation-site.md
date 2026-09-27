# RFC-0017: Documentation site

| | |
| :-- | :-- |
| Status | Draft |
| Depends on | RFC-0016 |
| Architecture | whole document; F8 (docs drift) |
| Commit | `docs(site): document the manifest, descriptors, secrets and the new CLI` |

## 1. Summary

Rewrite the pages of `packages/docs` that describe the configuration, adapters, secrets and the CLI,
so that they match the implemented system. Move the reference section from
`/reference/cloudabstraction/*` to `/reference/contracts/*` and add `/reference/config/`.

Everything that is **not** about configuration mechanics stays verbatim. That includes the two-tier
model (Tier 1 declarations vs. Tier 2 signed documents), authorization, sessions, signing keys, the
storage layout and the consumer SDK.

## 2. Files (all under `packages/docs/`)

**Rewrite** (content specified in §4):

| Page | Source of truth |
| :-- | :-- |
| `src/routes/guide/config/structure/+page.md` | Architecture §5.5, §8; keep the "two tiers" section verbatim |
| `src/routes/guide/config/providers/+page.md` | Architecture §4 D3, §5.5 (records keyed by provider name; two instances of one adapter) |
| `src/routes/guide/config/services/+page.md` | Per-service stanzas as in RFC-0003 §4.6; keep each service's semantic prose (what a bucket is, why secrets have one provider) verbatim where still true |
| `src/routes/guide/adapters/+page.md` | Architecture §4 D2, §5.4; RFC-0001 |
| `src/routes/guide/language-adapters/+page.md` | Replace the `languageAdapters:` registration example with `languages.providers` keyed by language; everything about the `LanguageAdapter` contract stays |
| `src/routes/guide/getting-started/+page.md` | RFC-0015 §4.10 (`genoa init`, `genoa dev`), `.genoacms/secrets.env` |
| `src/routes/guide/cli/+page.md` | RFC-0015 §4.1 (commands, flags, default modes) |

**Move and rewrite:**

| From | To |
| :-- | :-- |
| `src/routes/reference/cloudabstraction/authentication/+page.md` | `src/routes/reference/contracts/authentication/+page.md` |
| `…/database/+page.md` | `src/routes/reference/contracts/database/+page.md` |
| `…/secrets/+page.md` | `src/routes/reference/contracts/secrets/+page.md` |
| `…/storage/+page.md` | `src/routes/reference/contracts/storage/+page.md` |
| `…/deployment/+page.md` | `src/routes/reference/contracts/deployment/+page.md` |
| `…/config/+page.md` | `src/routes/reference/config/+page.md` |

**Modify:**
- `vite.config.ts`: the top-nav link and the `/reference/` sidebar group point at the new routes. The group is titled "Contracts" plus a separate "Config" entry.
- `src/routes/reference/sdk/attributes/+page.md`: replace its `@genoacms/cloudabstraction` mention with `@genoacms/contracts`.

**Delete:** `src/routes/reference/cloudabstraction/` after the moves.

## 3. Non-goals

- Do not change `guide/authorization`, `guide/sessions`, `guide/signing-keys`, `guide/storage-layout`, `guide/consumer`, `guide/introduction` or the SDK reference, except for literal mentions of removed names.
- No new site features, theme changes or dependencies.
- Do not document internal RFC detail such as scanner internals or host caching. Users need behavior, not mechanism.

## 4. Content requirements

Each rewritten page must satisfy every item that applies to it. Code examples must be complete, and
copied from, or consistent with, `packages/core/genoa.config.ts`, `packages/core/genoa.config.production.ts`
and `packages/cli/src/templates/genoa.config.ts`.

1. **config/structure:**
   - the file names and the lookup order (RFC-0003 §4.9.1);
   - one file per environment and `--config` (U1, U9);
   - config as data: what may be imported, and that adapters are named, never imported;
   - a full minimal `genoa.config.ts`;
   - the "two tiers" section, verbatim.
2. **config/providers:**
   - `*Provider()` helpers;
   - provider names as record keys;
   - `buckets` and `databases` referencing providers by name, with a compile error on typos;
   - a two-GCP-project example.
3. **config/services:** one section per stanza, with its fields and defaults (`pathDelimiter` `'|->'`, first target as default, exactly one secrets provider) and its error codes from the loader.
4. **Secrets**, in services or its own section:
   - `secret()`, `env()`, `inline()`;
   - the where-allowed table (architecture §6.2, including that deployment options never enter the build);
   - the bootstrap rule;
   - Application Default Credentials as the recommended production form;
   - the development store at `.genoacms/secrets.env`;
   - that rotation takes effect on restart.
5. **adapters:**
   - descriptor vs. runtime, and why the descriptor must be SDK-free;
   - `define*` helpers;
   - `secretOptions`, `developmentOnly`, `validate`;
   - registry augmentation;
   - a complete minimal third-party storage adapter (descriptor, runtime and `exports` map);
   - the deployment descriptor with `svelteKitAdapter`, `procedure` and `DeployContext`;
   - running `@genoacms/conformance`.
6. **getting-started:** `genoa init` → fill options → `genoa dev`, then the production config and `genoa deploy --config genoa.config.production.ts`.
7. **cli:**
   - every command, `--config`, `--mode` with the per-command defaults, `--no-inline`;
   - what `build` writes (`.genoacms/build`, its `package.json`);
   - that `deploy` resolves secrets through the configured store on the operator's machine.
8. **reference/contracts/***: the moved pages. The service method signatures are unchanged, so their tables stay. Remove every `declare module '@genoacms/adapter-*/…'` example and every `*Provider` type, and link to the adapters guide for how an adapter is shaped.
9. **reference/config:** `defineConfig`, the helpers, `LoadOptions`, `Manifest` and `RuntimeManifest`; `createHost` in one paragraph (for tooling authors); the `genoa()` plugin and the `GENOA_*` environment contract (architecture D7).

## 5. Steps

1. Move the reference pages with `git mv`, then rewrite them.
2. Rewrite the guide pages.
3. Update `vite.config.ts` and the SDK attributes page.
4. Run §6.

## 6. Verification

```bash
pnpm --filter @genoacms/docs run build
grep -rn "cloudabstraction\|adapterPath\|getProvider\|GENOA_BUILD\|GENOA_CONFIG_PATH\|DEPLOYMENT_PROVIDER\|languageAdapters:\|genoaConfig" packages/docs/src packages/docs/vite.config.ts || echo "no stale names: ok"
```

**Expected:**
- The build succeeds with no broken-link warnings for `/reference/` routes.
- The grep prints `no stale names: ok`.
- Every code block in the rewritten pages that shows a config type-checks conceptually against RFC-0003's types. The reviewer checks this; there is no automated doc-test harness.

## 7. Critique

**Pros.** Closes F8's documentation drift. The docs describe exactly what `packages/core` runs.

**Cons.** Moving routes breaks inbound links to `/reference/cloudabstraction/*`. Nothing is released,
so there are few external links to break.

**Blindspots.** Nothing checks that doc code examples compile. They will drift again unless a
doc-test step is added later, for example extracting ```ts blocks and running `tsc` over them.
