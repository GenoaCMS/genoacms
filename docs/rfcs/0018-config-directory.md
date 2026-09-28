# RFC-0018: One config directory

| | |
| :-- | :-- |
| Status | Implemented (`716c6de`, `05152e8`) |
| Depends on | RFC-0014 |
| Architecture | U12; §5.5 (default lookup); §8; §10 C1 |
| Commits | Part A: `feat(config): look up genoa.config/development in the config directory`; Part B: `refactor(core): keep the whole config in genoa.config/` |

Written after RFC-0014 was implemented. Implement it **before** RFC-0015, which scaffolds the same layout.

## 1. Summary

RFC-0014 put core's configs at the project root (`genoa.config.ts`, `genoa.config.production.ts`) and
their shared modules in a new `genoa/` directory, next to the existing `genoa.config/` that holds the
credential files. U12 puts all of it in `genoa.config/`:

```
packages/core/genoa.config/
  development.ts      was genoa.config.ts            (default lookup)
  production.ts       was genoa.config.production.ts (--config genoa.config/production.ts)
  collections.js      was genoa/collections.js
  authorization.ts    was genoa/authorization.ts
  security.ts         was genoa/security.ts
  languages.ts        was genoa/languages.ts
  gcp/                unchanged, gitignored credential files
```

- **Part A** changes the loader's default lookup from `genoa.config/index.*` to `genoa.config/development.*`.
- **Part B** moves core's files and updates the relative imports that point at them.

There are two commits, because they are two logical changes, and each is green on its own. After
Part A, core still has its root `genoa.config.ts`, which the lookup checks first.

## 2. Files

### 2.1 Part A, under `packages/config/`

| File | Change |
| :-- | :-- |
| `src/load/locate.ts` | In `CANDIDATES`, replace the four `genoa.config/index.{ts,mts,js,mjs}` entries with `genoa.config/development.{ts,mts,js,mjs}`, in the same order. Nothing else changes. |
| `src/load/loader.test.ts` | §4.1 |

### 2.2 Part B, under `packages/core/`

Move each file with `git mv`, so history follows it:

| From | To | Content change |
| :-- | :-- | :-- |
| `genoa.config.ts` | `genoa.config/development.ts` | `./genoa.config/gcp/` → `./gcp/`; `./genoa/<name>.js` → `./<name>.js`; comment `genoa.config.production.ts uses Secret Manager` → `production.ts uses Secret Manager` |
| `genoa.config.production.ts` | `genoa.config/production.ts` | `./genoa.config/gcp/` → `./gcp/`; `./genoa/<name>.js` → `./<name>.js` |
| `genoa/collections.js` | `genoa.config/collections.js` | none |
| `genoa/authorization.ts` | `genoa.config/authorization.ts` | none |
| `genoa/security.ts` | `genoa.config/security.ts` | none |
| `genoa/languages.ts` | `genoa.config/languages.ts` | none |

The four shared modules import only packages, so moving them changes none of their imports.

**Modify:**

| File | Change |
| :-- | :-- |
| `src/lib/script/bootstrap.test.ts` | `'../../../genoa/authorization'` → `'../../../genoa.config/authorization'`; `'../../../genoa/security'` → `'../../../genoa.config/security'` |
| `src/lib/script/database/collections.test.ts` | `'../../../../genoa/collections'` → `'../../../../genoa.config/collections'`. This is the path before RFC-0014, and it matches the file's own error message again. |
| `.npmignore` | Delete the lines `/genoa.config.ts`, `/genoa.config.production.ts` and `/genoa/`. The existing `/genoa.config` line covers the directory. |
| `playwright.config.ts` | Comment only: `genoa.config.ts` → `genoa.config/development.ts`. |
| `tests/README.md` | `` `genoa.config.ts` imports the `` → `` `genoa.config/development.ts` imports the ``. |

**Never touch:** `genoa.config/gcp/serviceAccount.json`, `genoa.config/gcp/authCredentials.js`,
`.genoacms/secrets.env` (rule 3). They are neither moved nor read. Only their importers' paths change.

## 3. Non-goals

- **No mode-based lookup.** A production build without `--config` still finds `development.ts` and is refused by the `developmentOnly` check (U9). The production config is always named.
- **No ambiguity error.** When both `genoa.config.ts` and `genoa.config/development.ts` exist, the root file still wins, as RFC-0003 specifies.
- **No change to how the project root is found.** The root is `GENOA_PROJECT`, or `cwd`, and never the config file's directory.
- The CLI's `init` template and the documentation site are covered by RFC-0015 and RFC-0017.

## 4. Specification

### 4.1 `src/load/loader.test.ts`

Replace the case `finds genoa.config/index.ts when genoa.config.ts is absent, and prefers genoa.config.ts`
with these two cases, which use the existing `project` helper:

1. `finds genoa.config/development.ts when genoa.config.ts is absent, and prefers genoa.config.ts`. This is the old case with `genoa.config/index.ts` replaced by `genoa.config/development.ts` in both projects.
2. `does not take index.ts or production.ts in genoa.config/ as the default`:
   - a project whose only config file is `genoa.config/index.ts` (`configName: 'genoa.config/index.ts'`) rejects with `config/not-found`;
   - a project whose only config file is `genoa.config/production.ts` rejects with `config/not-found`.

### 4.2 Error message

`locateConfigFile`'s `config/not-found` message lists `CANDIDATES`, so it names the new files without
a separate change.

## 5. Steps

1. **Baseline.** Record the core numbers from RFC-0014's commit: 2357 unit tests passing, `svelte-check` at 121 errors, ESLint at 67 problems.
2. Part A (§2.1, §4.1). Run §6.1 and commit it.
3. Part B (§2.2). Run §6.2 and commit it.

## 6. Verification

### 6.1 Part A

```bash
pnpm --filter @genoacms/config run test
pnpm --filter @genoacms/config run check
```

**Expected:** every test passes, including both cases of §4.1, and `check` exits 0.

### 6.2 Part B

Run from `packages/core`:

```bash
test ! -e genoa.config.ts && test ! -e genoa.config.production.ts && test ! -e genoa && echo "root clean"
ls genoa.config
grep -rn "genoa/\(collections\|authorization\|security\|languages\)\|genoa\.config\.ts\|genoa\.config\.production" \
  src tests genoa.config/*.ts genoa.config/*.js *.ts *.js .npmignore
```

**Expected:**
- `root clean`;
- `ls` lists `authorization.ts collections.js development.ts gcp languages.ts production.ts security.ts`;
- the grep prints nothing. The new paths (`genoa.config/development.ts`, `genoa.config/collections.js`) do not match its patterns. The globs never reach `genoa.config/gcp/`.

```bash
pnpm exec svelte-kit sync
pnpm run test:unit
pnpm run check 2>&1 | tail -3
pnpm run lint 2>&1 | tail -3
```

**Expected:** unit tests at least as green as the baseline, `check` ≤ 121 errors, `lint` ≤ 67 problems.

```bash
node --input-type=module -e "
import { loadConfig } from '@genoacms/config/load'
const dev = await loadConfig({ root: process.cwd(), mode: 'development' })
const prod = await loadConfig({ root: process.cwd(), file: process.cwd() + '/genoa.config/production.ts', mode: 'production', onWarning: () => {} })
console.log(dev.source.file.endsWith('/genoa.config/development.ts'), Object.keys(dev.adapters).length, Object.keys(prod.adapters).length)
await loadConfig({ root: process.cwd(), mode: 'production' }).then(() => console.log('UNEXPECTED'), e => console.log(e.issues.map(i => i.code).join(',')))
"
```

**Expected:** `true 6 6`, then `config/development-only`.

```bash
pnpm run build
PORT=43210 node .genoacms/build/index.js & SERVER=$!
sleep 5; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:43210/login; kill $SERVER
```

**Expected:** the build succeeds and `curl` prints `200` or `302`.

## 7. Critique

**Pros.**
- The move is mechanical: six `git mv`s, two test import paths and three comment or ignore lines. No runtime code changes.
- `collections.test.ts` returns to the path it used before RFC-0014.
- Part A is tested on its own, so the loader contract is pinned before core relies on it.

**Cons & trade-offs.**
- The RFC-0003 test case for `genoa.config/index.ts` is replaced rather than kept. A project that used the old directory entry point gets `config/not-found`. Nothing is released, so no project has one.
- Two commits for one RFC is an exception to rule 8, taken so that each commit holds one logical change.

**Blindspots.**
- The grep in §6.2 is built from known names. A reference written another way, such as a `path.join('genoa', …)`, would not be caught. The build, the unit tests and the boot smoke test are the backstop, because a wrong path fails to resolve.
- If both a root `genoa.config.ts` and `genoa.config/development.ts` ever exist in core, the root file silently wins (architecture U12 critique). §6.2's `root clean` check guards core itself, not user projects.
