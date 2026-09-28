---
type: rfc
number: 19
title: No provider I/O while SvelteKit analyses the build
status: implemented
commits: [8bec7a0]
depends: [18]
architecture: [configuration.md]
commit-subject: fix(core): construct no provider while SvelteKit analyses the build
sections: legacy
---

# RFC-0019: No provider I/O while SvelteKit analyses the build

| | |
| :-- | :-- |
| Depends on | RFC-0018 |
| Architecture | D8, F18; goal 6; §10 K1 |
| Commit | `fix(core): construct no provider while SvelteKit analyses the build` |

Found while verifying RFC-0015. Implement it **before** RFC-0015, whose verification builds the
production config with no credential present.

## 1. Summary

SvelteKit runs the built server during `vite build` to analyse it, and that evaluates
`hooks.server.ts` and the routes' server modules. Two module-scope calls in core then do provider I/O
against the configured instance (F18). This RFC:

1. skips both calls while `building` (`$app/environment`);
2. makes core's host loader refuse to load an adapter runtime while `building`, so a future module-scope call fails the build by name instead of reaching an instance.

## 2. Files

All under `packages/core/`. **Modify only:**

| File | Change |
| :-- | :-- |
| `src/hooks.server.ts` | §3.1 |
| `src/lib/script/database/database.server.ts` | §3.2 |
| `src/lib/script/host.server.ts` | §3.3 |

## 3. Specification

### 3.1 `src/hooks.server.ts`

- Add `import { building } from '$app/environment'`.
- Replace `await ensureInstanceInitialized()` with `if (!building) await ensureInstanceInitialized()`.
- Append this sentence to the comment above it: "Skipped while SvelteKit runs the app to analyse the build (architecture D8): a build must not bootstrap the instance it is built for."

### 3.2 `src/lib/script/database/database.server.ts`

- Add `import { building } from '$app/environment'` and `import type { DirectoryContents } from '@genoacms/contracts/storage'`.
- Add, above the listing:

  ```ts
  /** Nothing is listed, and nothing created, while SvelteKit analyses the build (architecture D8). */
  const noContents: DirectoryContents = { files: [], directories: [] }
  ```

- The listing becomes:

  ```ts
  const collectionsDirectoryContents = building
    ? noContents
    : await listOrCreateDirectory({ name: collectionsDirectory, bucket: defaultBucketId })
  ```

Nothing else in the file changes.

### 3.3 `src/lib/script/host.server.ts`

Add `import { building } from '$app/environment'` and a named loader:

```ts
/**
 * Refuses while SvelteKit analyses the build (architecture D8). Module-scope code that reaches a
 * provider must check `building` itself; this makes forgetting to do so fail the build by name,
 * rather than read from or write to a live instance.
 */
async function loadRuntime (specifier: string) {
  if (building) throw new Error(`host/building: ${specifier} was requested while SvelteKit analyses the build; module-scope provider I/O must check building`)
  return await import(/* @vite-ignore */ specifier)
}
```

`createHost` receives `load: loadRuntime`. Keep the existing doc comment above `host`. Its sentence
about the opaque specifier now applies to `loadRuntime`, so move that sentence onto `loadRuntime`'s
comment unchanged.

## 4. Non-goals

- No change to `ensureInstanceInitialized`, `listOrCreateDirectory` or the host package.
- No change to when the collection listing is read at runtime. It is still read once per process, at import.
- No fix for provider failures that escape the promise chain at runtime (architecture D8 critique).

## 5. Steps

1. Baseline: RFC-0018's numbers (2357 unit tests passing, `svelte-check` 121 errors, ESLint 67).
2. §3.1 to §3.3.
3. Run §6.

## 6. Verification

Run from `packages/core`:

```bash
pnpm exec svelte-kit sync
pnpm run test:unit 2>&1 | tail -4
pnpm run check 2>&1 | tail -2
pnpm run lint 2>&1 | tail -2
```

**Expected:** unit tests at least as green as the baseline, `check` ≤ 121 errors, `lint` ≤ 67 problems.

The development build must leave the secret store untouched. Record its modification time and size,
without reading it:

```bash
stat -c '%Y %s' .genoacms/secrets.env > /tmp/genoa-store-before
pnpm run build
stat -c '%Y %s' .genoacms/secrets.env | diff - /tmp/genoa-store-before && echo "store untouched by the build"
```

The production config must build with no credential present. Unset every Google credential variable
for the command, so Application Default Credentials cannot be found:

```bash
env -u GOOGLE_APPLICATION_CREDENTIALS -u GOOGLE_CLOUD_PROJECT \
  GENOA_PROJECT=$PWD GENOA_CONFIG=$PWD/genoa.config/production.ts GENOA_TARGET=gcp GENOA_MODE=production \
  pnpm exec vite build > /tmp/genoa-prod-build.log 2>&1; echo "exit=$?"
grep -c "Could not load the default credentials" /tmp/genoa-prod-build.log
```

**Expected:** `store untouched by the build`, `exit=0`, and a count of `0`. Before this RFC, the
production build exits 1 with the credentials error.

Finally, the built development server still bootstraps at runtime:

```bash
pnpm run build
PORT=43210 node .genoacms/build/index.js & SERVER=$!
sleep 5; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:43210/login; kill $SERVER
```

**Expected:** `200` or `302`.

## 7. Critique

**Pros.**
- Three small edits turn a silent write to the live instance, made during every build, into nothing, and turn its recurrence into a named build failure.
- It uses the flag SvelteKit documents for this case.

**Cons & trade-offs.**
- The loader guard is never exercised by the verification, because both call sites are guarded. It is covered by reading §3.3, not by a test. A unit test would have to import `host.server.ts`, which loads the real manifest (tests/README).

**Blindspots.**
- The guard covers provider construction only. Direct I/O at import time without the host is not caught.
- `building` is also true while prerendering. Nothing prerenders today.
