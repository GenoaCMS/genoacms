# RFC-0014: Cutover: flip adapter exports and integrate core

| | |
| :-- | :-- |
| Status | Implemented (`f9a432c`) |
| Depends on | RFC-0001 to RFC-0013 |
| Architecture | §4 (all); §5.2; §8; §9; U6, U7, U8, U11 |
| Commit | `refactor: switch core and adapters to the manifest and host` |
| Amended by | RFC-0018 (U12): core's configs and shared modules move into `genoa.config/` (§2.2, §4.1, §4.2) |

## 1. Summary

The one commit where the new architecture goes live. It has these parts, in this order:

1. **Baseline:** record today's check, lint and test results.
2. **Adapters:** flip every adapter's `exports` to its descriptor and runtime, delete the old modules, and drop `@genoacms/cloudabstraction`.
3. **Core configuration:** `genoa.config.ts` (development, today's providers and credential files through `inline()`), `genoa.config.production.ts` (GCP Secret Manager with ADC, target `gcp`), and shared modules.
4. **Core wiring:** `host.server.ts`, the virtual manifest type, `svelte.config.js`, `vite.config.ts`, `package.json` scripts.
5. **Core consumers:** every `config` read becomes a host read, and every contract import is renamed.
6. **Tests:** host mocks replace the `@genoacms/cloudabstraction` mocks.
7. **STOP for the author (U11):** move `packages/core/.env` to `packages/core/.genoacms/secrets.env`.
8. **Cleanup:** remove `envDir: false` and `viteConfig.test.ts`, and add `.genoacms/` to `.gitignore`.
9. **Verification**, including a boot smoke test of the built artifact.

After this RFC, the CLI (RFC-0015) is the only remaining importer of `@genoacms/cloudabstraction`.

## 2. Files

### 2.1 Adapters (Part 2)

| Package | `exports` after | Delete | `package.json` other |
| :-- | :-- | :-- | :-- |
| `adapter-gcp` | `"./storage"` → `dist/storage/descriptor.{js,d.ts}`; `"./storage/runtime"` → `dist/storage/runtime.*`; the same pattern for `database` and `secrets`; `"./deployment"` → `dist/deployment/descriptor.*` | `src/services/`, `src/config.ts`, `src/genoa.config.d.ts`, `deployment/` | `files: ["dist"]`; remove `@genoacms/cloudabstraction` |
| `adapter-aws` | `"./storage"` → `src/storage/descriptor.js` (types `descriptor.d.ts`); `"./storage/runtime"` → `src/storage/runtime.js`; the same for `database`; `"./deployment"` → `src/deployment/descriptor.js` | `src/services/`, `src/config.d.ts` | remove `"main"`; remove `@genoacms/cloudabstraction` |
| `adapter-minio` | `"."` → `src/descriptor.js` (+ types); `"./runtime"` → `src/runtime.js` (+ types) | `src/index.js` | `"main": "src/descriptor.js"`; remove `@genoacms/cloudabstraction` |
| `adapter-postgres` | as minio | `src/index.js` | as minio |
| `adapter-secrets-env` | as minio (drop the `"./secrets"` alias) | `src/index.js` | as minio |
| `authentication-adapter-array` | as minio (new `exports` field) | `src/index.js` | as minio |
| `adapter-node` | `"."` → `src/descriptor.js` (+ types) | `src/index.js`, `src/deploy.js` | `"main": "src/descriptor.js"`; remove `@genoacms/cloudabstraction` |
| `language-adapter-ts` | `"."` → `dist/descriptor.{js,d.ts}`; `"./runtime"` → `dist/runtime.{js,d.ts}` | none | `"main": "./dist/descriptor.js"`, `"types": "./dist/descriptor.d.ts"`; remove `@genoacms/cloudabstraction` |

Every `exports` entry lists `"types"` before `"import"`.

Also modify `packages/sdk/src/execute/attacks.test.ts`: import `analyze` and `compileBundle` from
`'@genoacms/language-adapter-ts/runtime'`.

### 2.2 Core (Parts 3 to 8), under `packages/core/`

**Create:**

| File | Content |
| :-- | :-- |
| `genoa.config.ts` | §4.1 |
| `genoa.config.production.ts` | §4.2 |
| `genoa/collections.js` | moved from `genoa.config/collections.js`; its import becomes `@genoacms/contracts/schemas` |
| `genoa/authorization.ts` | `export const authorization: AuthorizationConfig`: the `authorization` stanza of `genoa.config/gcp/index.js`, with its comments |
| `genoa/security.ts` | `export const security: SecurityConfig`: the `security` stanza, with its comments |
| `genoa/languages.ts` | `export const languages`: §4.1 |
| `src/lib/script/host.server.ts` | §4.3 |
| `src/virtual.d.ts` | `/// <reference types="@genoacms/config/client" />` |
| `secrets.env.example` | renamed from `.env.example`; §4.8 |

**Modify:** `svelte.config.js`, `vite.config.ts`, `package.json`, `.npmignore`, `playwright.config.ts`
(comment only), `tests/README.md`, and every file in §4.5 and §4.6.
`src/lib/script/database/collections.test.ts` imports the moved collections file: its import becomes
`'../../../../genoa/collections'`.

**Delete:**
- `genoa.config/index.js`, `genoa.config/gcp/index.js`, `genoa.config/aws/index.js`, `genoa.config/collections.js`;
- `src/lib/script/secrets/references.server.ts`;
- `src/viteConfig.test.ts` (Part 8 only);
- `.env.example` (renamed).

**Never touch:** `genoa.config/gcp/serviceAccount.json`, `genoa.config/gcp/authCredentials.js`, `.env`.

### 2.3 Repository root

- `.gitignore`: add `.genoacms/` under `# build output`.
- `pnpm-lock.yaml` (via `pnpm install`).

## 3. Non-goals

- The CLI stays broken against the new shape until RFC-0015. Its `deploy`, `run` and `database` still import `@genoacms/cloudabstraction`, and its unit test (`declaration.test.js`) keeps passing.
- No production deploy. `genoa.config.production.ts` is only loaded in verification (U10).
- No change to storage paths inside buckets (`.genoacms/...` object names are a different namespace from the local `.genoacms/` directory).
- No behavioral change to any service function beyond where its provider comes from.
- Do not make core's CI build credential-free (U7).

## 4. Specification

### 4.1 `packages/core/genoa.config.ts` (development)

```ts
import {
  defineConfig, storageProvider, databaseProvider, authenticationProvider,
  secretsProvider, deploymentTarget, inline
} from '@genoacms/config'
import type {} from '@genoacms/adapter-gcp/storage'
import type {} from '@genoacms/adapter-gcp/database'
import type {} from '@genoacms/adapter-secrets-env'
import type {} from '@genoacms/authentication-adapter-array'
import type {} from '@genoacms/adapter-node'
// Gitignored and kept where they have always been (U7). This file therefore needs them to load.
import serviceAccount from './genoa.config/gcp/serviceAccount.json' with { type: 'json' }
import authCredentials from './genoa.config/gcp/authCredentials.js'
import { collections } from './genoa/collections.js'
import { authorization } from './genoa/authorization.js'
import { security } from './genoa/security.js'
import { languages } from './genoa/languages.js'

export default defineConfig({
  authentication: {
    cookieName: '__session',
    providers: {
      array: authenticationProvider('@genoacms/authentication-adapter-array', { credentials: inline(authCredentials) })
    }
  },
  secrets: {
    // Development only: a production build refuses it. genoa.config.production.ts uses Secret Manager.
    providers: { local: secretsProvider('@genoacms/adapter-secrets-env', {}) }
  },
  storage: {
    providers: {
      'FIM-gcs': storageProvider('@genoacms/adapter-gcp/storage', { projectId: 'genoacms', credentials: inline(serviceAccount) })
    },
    buckets: { genoacms: { provider: 'FIM-gcs' }, 'genoacms-public': { provider: 'FIM-gcs' } },
    defaultBucket: 'genoacms'
  },
  database: {
    providers: {
      firestore: databaseProvider('@genoacms/adapter-gcp/database', { projectId: 'genoacms', databaseId: '(default)', credentials: inline(serviceAccount) })
    },
    databases: { firestore: { provider: 'firestore', collections } }
  },
  languages,
  deployment: { targets: { local: deploymentTarget('@genoacms/adapter-node', {}) } },
  authorization,
  security
})
```

Carry the comments from today's `genoa.config/gcp/index.js` stanzas into the matching places here and
in `genoa/*.ts`. The Firestore `region` is dropped (RFC-0007 §4.3).

`genoa/languages.ts`:

```ts
import { languageProvider } from '@genoacms/config'
import type {} from '@genoacms/language-adapter-ts'

/**
 * (Carry the comment on `languages` from genoa.config/gcp/index.js.) Keyed by the language a
 * component records, which is what the adapter reports as its `language`.
 */
export const languages = {
  providers: {
    // (Carry the comment on `target`.)
    typescript: languageProvider('@genoacms/language-adapter-ts', { target: 'es2020' })
  }
}
```

### 4.2 `packages/core/genoa.config.production.ts`

The same `collections`, `authorization`, `security` and `languages` imports. Differences from §4.1:

| Stanza | Production |
| :-- | :-- |
| `authentication.providers.array` | `{ credentials: secret('GENOACMS_ADMIN_CREDENTIALS') }` |
| `secrets.providers` | `{ 'secret-manager': secretsProvider('@genoacms/adapter-gcp/secrets', { projectId: 'genoacms' }) }`: no credentials, so ADC (the function's service account) |
| `storage.providers['FIM-gcs']` | `{ projectId: 'genoacms' }`: ADC |
| `database.providers.firestore` | `{ projectId: 'genoacms', databaseId: '(default)' }`: ADC |
| `deployment` | `{ targets: { gcp: deploymentTarget('@genoacms/adapter-gcp/deployment', { projectId: 'genoacms', region: 'europe-west3', credentials: inline(serviceAccount) }) } }`: the deploy credential is used on the operator's machine only (§6.2 of the architecture) |

The type-only imports cover `@genoacms/adapter-gcp/secrets` and `@genoacms/adapter-gcp/deployment`
instead of secrets-env and node. `serviceAccount` is imported as in §4.1 and used **only** in
`deployment`.

### 4.3 `src/lib/script/host.server.ts`

```ts
import { createHost } from '@genoacms/config/host'
import { manifest } from 'virtual:genoa/manifest'

/**
 * The one host of this process: every provider comes from here, and no other module reads the
 * manifest.
 *
 * The loader lives in core, not in @genoacms/config, because the specifier must stay opaque to the
 * bundler: SvelteKit's adapters would otherwise pull each adapter, and its cloud SDK, into the
 * server bundle. At runtime the specifier resolves from the artifact's node_modules, which the
 * generated package.json provides.
 */
export const host = createHost({
  manifest,
  load: async (specifier) => await import(/* @vite-ignore */ specifier)
})
```

### 4.4 Wiring

`svelte.config.js`:

```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { readGenoaEnvironment, resolveKitAdapter } from '@genoacms/config/load'

// svelte.config.js cannot know Vite's command; GENOA_MODE is set by the CLI and by `pnpm build`.
const { root, file, target, mode } = readGenoaEnvironment('development')

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: await resolveKitAdapter({ root, file, target, mode }),
    experimental: { remoteFunctions: true }
  }
}

export default config
```

Keep today's comment lines about preprocessors. Delete the adapter-auto comment.

`vite.config.ts`:
- add `import { genoa } from '@genoacms/config/vite'`;
- `plugins: [genoa(), tailwindcss(), sveltekit()]`;
- delete `envDir: false` and its comment block **in Part 8 only**;
- everything else unchanged.

`package.json`:
- dependencies: replace `@genoacms/cloudabstraction` with `"@genoacms/config": "workspace:^"` and `"@genoacms/contracts": "workspace:^"`;
- devDependencies: unchanged (every adapter used by the two configs is already listed);
- scripts:
  - `"adapters": "pnpm --filter @genoacms/config --filter @genoacms/language-adapter-ts --filter @genoacms/adapter-gcp --filter @genoacms/sveltekit-adapter-cloud-run-functions run build"` (F17);
  - `"build": "pnpm run adapters && GENOA_MODE=development vite build"`. The monorepo build is a development artifact for Playwright's `build && preview` against the dev store; production builds go through the CLI.

`.npmignore`: add `/genoa.config.ts`, `/genoa.config.production.ts`, `/genoa/`, `/secrets.env.example`
and `/.genoacms`, so core's own configs are never published.

### 4.5 Core consumers: rewrites

| File | Change |
| :-- | :-- |
| `src/lib/script/storage/providers.server.ts` | Remove the `config` import and `getProviderByBucketName`. Each of the ten functions becomes `(await host.storageForBucket(reference.bucket)).<method>(…)` with the same arguments. Exported names and signatures unchanged. |
| `src/lib/script/database/providers.server.ts` | `getCollections()` → `[...host.collections]`; `getDatabaseNames()` → `[...host.databases]`; every document function → `(await host.databaseForCollection(<collection name>)).<method>(…)`. Remove the private lookup helpers. |
| `src/lib/script/auth/providers.server.ts` | Remove the module-scope `await getProviders(...)`. `authenticate` calls `await host.authenticationProviders()` on each call (the host caches), then `callProvidersFunction` and `firstNonNull` as today. `authentication.Identity` → `Identity` from `@genoacms/contracts/authentication`. |
| `src/lib/script/secrets/providers.server.ts` | Remove `getSoleProvider` and the module-scope `adapter`. Each function starts with `const adapter = await host.secrets()`. `getOrClaimSecret` keeps its body and doc comment. The file's doc comment stays, and its last sentence changes to say the loader enforces "exactly one" (`config/secrets-provider-count`). |
| `src/lib/script/components/language.server.ts` | `getLanguageAdapter(language)` becomes `await host.language(language)`. Remove `loaded` and `loadAdapters`. Keep the module doc comment, but replace its "declared in genoa.config as a path and a dynamic import" sentence with "declared in `languages.providers`, keyed by language; constructed by the host on first use". |
| `src/lib/script/providers.server.ts` | Delete `getProviders` and `getProvider`. Keep `callProvidersFunction` and `firstNonNull`. |
| `src/lib/script/auth/auth.server.ts` | `const { cookieName } = config.authentication` → `const { cookieName } = host`. `authentication.Identity` → `Identity`. |
| `src/lib/script/authorization/declared.server.ts` | `config.authorization?.roles` → `host.authorization.roles`, the same for `assignments` and `lockRoles`. Delete the "Read defensively…" comment, because the loader guarantees the stanza. |
| `src/lib/script/securityPolicy/policy.server.ts` | `config.security.<x>` → `host.security.<x>`. |
| `src/lib/script/storage/storage.server.ts` | `getBucketReferences()` returns `host.buckets.map(name => ({ name }))`: callers (`configuration/user.server.ts`, `storage/user.server.ts`) and the tests that mock it read only `name`. `defaultBucketId = host.defaultBucket`. |
| `src/routes/(admin)/storage/[bucketId]/[...path]/contents/+page.server.ts` | `const delimiter = host.pathDelimiter`. |

Every rewritten file imports `{ host }` from `'$lib/script/host.server'`.

### 4.6 Core consumers: mechanical renames

In every file listed by
`grep -rln "@genoacms/cloudabstraction/" packages/core/src packages/core/tests`, replace:
- `@genoacms/cloudabstraction/storage` → `@genoacms/contracts/storage`;
- `@genoacms/cloudabstraction/database` → `@genoacms/contracts/database`;
- `@genoacms/cloudabstraction/secrets` → `@genoacms/contracts/secrets`;
- `@genoacms/cloudabstraction/schemas` → `@genoacms/contracts/schemas`.

`BucketInit`, `SecretReference` and `isSecretReference` no longer exist. Their only users are rewritten
or deleted in §4.5.

Comment-only mentions:
- `src/lib/script/authorization/permissions.ts`, line 2: "re-exported from `@genoacms/internal/authorization`". Also update the paragraph after it, which explains why the vocabulary lives beside the config contract, to name `@genoacms/internal` and the `AuthorizationConfig` type in `@genoacms/config`.
- `src/lib/script/authorization/README.md`, line 7: `@genoacms/contracts`.
- `src/lib/script/components/componentHeader/io.server.ts`, line 78: `@genoacms/contracts/storage`.

### 4.7 Tests

- `src/lib/script/bootstrap.test.ts`: replace the `vi.mock('@genoacms/cloudabstraction', …)` block with:

  ```ts
  vi.mock('$lib/script/host.server', async () => {
    const { authorization } = await import('../../../genoa/authorization')
    const { security } = await import('../../../genoa/security')
    return {
      host: {
        get authorization () { return { ...authorization, roles: declaredRoles.value } },
        security,
        defaultBucket: 'test-bucket'
      }
    }
  })
  ```

  If the modules under test read another `host` member, add it with the value today's real config
  would have supplied, and name it in the commit message. The relative import depth must match the
  file's location.
- `src/lib/script/auth/auth.server.test.ts`: replace the `@genoacms/cloudabstraction` mock with `vi.mock('$lib/script/host.server', () => ({ host: { cookieName: COOKIE_NAME } }))`.
- `src/lib/script/securityPolicy/user.server.test.ts`: rename the mocked specifier to `@genoacms/contracts/storage`.
- `tests/README.md`: replace the "Writing new unit tests" paragraph with: unit tests must not import `$lib/script/host.server` unmocked, because it constructs real providers on use; mock it as `bootstrap.test.ts` does. Update the E2E credentials paragraph: `genoa.config.ts` imports `genoa.config/gcp/serviceAccount.json` and `authCredentials.js`, and the dev store is `.genoacms/secrets.env`.
- `playwright.config.ts`: change the comment `build authenticates against the configured provider` to `build loads genoa.config.ts, which imports gitignored credential files`.

### 4.8 `secrets.env.example`

The content of `.env.example`, with two edits:
- `cp .env.example .env` becomes `cp secrets.env.example .genoacms/secrets.env` (after `mkdir -p .genoacms`);
- `` `.env` is gitignored `` becomes `` `.genoacms/` is gitignored ``.

The remaining lines, including the entry names, are unchanged.

## 5. Steps

1. **Baseline** (record the output in the PR description):

   ```bash
   pnpm --filter @genoacms/core exec svelte-kit sync
   pnpm --filter @genoacms/core run check 2>&1 | tail -3
   pnpm --filter @genoacms/core run lint 2>&1 | tail -3
   pnpm --filter @genoacms/core run test:unit 2>&1 | tail -5
   ```

2. Part 2 (adapters), then `pnpm install`.
3. Part 3 (configs and shared modules).
4. Part 4 (wiring).
5. Part 5 (§4.5, then §4.6).
6. Part 6 (§4.7).
7. **STOP: author action (U11).** Ask the author to run the following, and wait for confirmation:

   ```bash
   mkdir -p packages/core/.genoacms
   mv packages/core/.env packages/core/.genoacms/secrets.env
   ```

   Then check, without reading either file:

   ```bash
   test -f packages/core/.genoacms/secrets.env && test ! -e packages/core/.env && echo moved
   ```

   It must print `moved`. **Do not run the dev server, a build or any e2e test before this step.** Doing so would mint a new root key into an empty store.
8. Part 8: delete `envDir: false` with its comment from `vite.config.ts`, delete `src/viteConfig.test.ts`, rename `.env.example` to `secrets.env.example` with the §4.8 edits, and add `.genoacms/` to the root `.gitignore`.
9. Run §6.

## 6. Verification

```bash
pnpm install
pnpm --filter @genoacms/core run adapters
grep -rn "@genoacms/cloudabstraction" packages --include=*.ts --include=*.js --include=*.svelte --include=package.json \
  | grep -v node_modules | grep -v "^packages/cloudAbstraction/" | grep -v "^packages/cli/" | grep -v "^packages/internal/" | grep -v "/dist/"
```

The grep must print nothing: only the CLI, the package itself and four comments in `@genoacms/internal`
may still reference it. Those comments name no import; RFC-0016 §2 rewrites them with the package's deletion.

```bash
pnpm --filter @genoacms/core exec svelte-kit sync
pnpm --filter @genoacms/core run test:unit
pnpm --filter @genoacms/core run check 2>&1 | tail -3
pnpm --filter @genoacms/core run lint 2>&1 | tail -3
pnpm -r --filter "./packages/adapter-*" --filter @genoacms/authentication-adapter-array --filter @genoacms/language-adapter-ts --filter @genoacms/sdk --filter @genoacms/config --filter @genoacms/contracts --filter @genoacms/conformance run test
```

**Expected:** unit tests at least as green as the baseline; `check` and `lint` error counts ≤ baseline;
every package test passes.

**Config load**, run from `packages/core`:

```bash
node --input-type=module -e "
import { loadConfig } from '@genoacms/config/load'
const dev = await loadConfig({ root: process.cwd(), mode: 'development' })
const prod = await loadConfig({ root: process.cwd(), file: process.cwd() + '/genoa.config.production.ts', mode: 'production', onWarning: () => {} })
console.log(Object.keys(dev.adapters).length, Object.keys(prod.adapters).length)
await loadConfig({ root: process.cwd(), mode: 'production' }).then(() => console.log('UNEXPECTED'), e => console.log(e.issues.map(i => i.code).join(',')))
"
```

**Expected:** two positive counts, then `config/development-only`. The development config is
refused in production mode.

**Build and boot smoke test**, run from `packages/core`. This uses the dev config's GCS bucket and
Firestore, exactly like `pnpm dev`:

```bash
pnpm run build
test -f .genoacms/build/index.js && echo "artifact in project .genoacms: ok"
grep -rl "@google-cloud/storage" .genoacms/build/server || echo "SDK not bundled: ok"
node --input-type=module -e "
import { createRuntimePackage } from '@genoacms/config/build'
import { loadConfig } from '@genoacms/config/load'
const manifest = await loadConfig({ root: process.cwd(), mode: 'development' })
const { pkg, blind } = await createRuntimePackage({ buildDir: process.cwd() + '/.genoacms/build', coreDir: process.cwd(), root: process.cwd(), manifest })
console.log(Object.keys(pkg.dependencies).join(',')); console.log(blind.join('\n'))
"
PORT=43210 node .genoacms/build/index.js & SERVER=$!
sleep 5; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:43210/login; kill $SERVER
```

**Expected:**
- both `ok` lines;
- the dependency list includes `@genoacms/adapter-gcp`, `@genoacms/adapter-secrets-env`, `@genoacms/authentication-adapter-array` and `@genoacms/language-adapter-ts`, and excludes `vite`, `vitest` and `tailwindcss`;
- `blind` has exactly two lines: one in the chunk containing Svelte's `obfuscated_import`, one in the chunk containing `host.server`;
- `curl` prints `200` or `302`.

Any other `blind` entry is a discovery: stop, per the RFC index.

**Manual, by the author:** `pnpm dev` in `packages/core`. Log in, open storage, collections and a
component. Confirm the signing keys are the existing ones (the key registry page shows no new root).

## 7. Critique

**Pros.**
- One reviewable commit moves every consumer.
- Every step before it was green on its own.
- The artifact check and the boot smoke test turn architecture §7.1's claims into assertions.

**Cons & trade-offs.**
- This is the largest RFC. §4.5 and §4.6 are mechanical, but touch about 45 files.
- The CLI is knowingly broken until RFC-0015, on a branch that is not merged until RFC-0017.

**Blindspots.**
- The `bootstrap.test.ts` host mock reproduces what the real config supplied. If a module under test reads a host member the mock lacks, the failure is a `TypeError` on `undefined`, and the rule in §4.7 tells the agent to add it deliberately.
- The boot smoke test proves the server starts and serves `/login` from the monorepo's `node_modules`. It does not prove that the generated `package.json` alone suffices in an empty directory. That needs published `@genoacms/*` versions (architecture §7.1 constraint) and waits for the first real deploy (U10).
- Step 7 depends on the author. If the verification is run before the move, a new root seed is minted into the empty store. The step is written as a hard stop for that reason.
