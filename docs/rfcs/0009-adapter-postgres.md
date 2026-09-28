---
type: rfc
number: 9
title: Port `@genoacms/adapter-postgres`
status: implemented
commits: [1b52359]
depends: [1, 2]
architecture: [configuration.md]
commit-subject: feat(adapter-postgres): add descriptor and runtime factory
sections: legacy
---

# RFC-0009: Port `@genoacms/adapter-postgres`

| | |
| :-- | :-- |
| Depends on | RFC-0001, RFC-0002 |
| Architecture | §4 D2; F3, F5 |
| Commit | `feat(adapter-postgres): add descriptor and runtime factory` |

## 1. Summary

Add a descriptor and a runtime factory next to `src/index.js`. The nested `config` object becomes
top-level options, with `username` renamed to `user` (the `pg` name that today's code already maps
it to), and the password becomes a `Secret` field. The method bodies are unchanged.

## 2. Files

**Create** (under `packages/adapter-postgres/`):

| File | Purpose |
| :-- | :-- |
| `src/descriptor.js`, `src/descriptor.d.ts` | §4.1 |
| `src/runtime.js`, `src/runtime.d.ts` | §4.2 |
| `src/descriptor.test.js`, `src/runtime.test.js` | §5.1 |
| `test/fixture.js` | `export const collections` and `export const testDocuments`, moved from `genoa.config/collections.js` and `genoa.config/index.js` (content unchanged) |
| `test/conformance.test.js` | §5.2 |

**Modify** `package.json`:
- add the dependency `"@genoacms/contracts": "workspace:^"`;
- add the dev dependency `"@genoacms/conformance": "workspace:^"`;
- change `"main"` from the non-existent `index.js` to `"src/runtime.js"`;
- scripts: `"test": "vitest run src"`, `"test:conformance": "vitest run test"`.

`exports` are unchanged.

**Delete:** `genoa.config/index.js` and `genoa.config/collections.js`. Their content moves to
`test/fixture.js`.

## 3. Non-goals

- Do not modify `src/index.js`.
- Do not change any query, table naming or primary-key handling.
- No connection-pool teardown API (§8).

## 4. Specification

### 4.1 Descriptor

```ts
export interface PostgresDatabaseOptions {
  host: string
  port?: number
  database: string
  user: string
  password: Secret
}
declare module '@genoacms/contracts' {
  interface DatabaseAdapters { '@genoacms/adapter-postgres': PostgresDatabaseOptions }
}
```

- `runtime: '@genoacms/adapter-postgres/runtime'`, `secretOptions: { password: 'string' }`.
- `validate` rejects unknown keys and requires non-empty `host`, `database` and `user`, a `password`, and an integer `port` when present.

### 4.2 Runtime

```js
export default defineRuntime({
  create ({ host, port, database, user, password }) {
    const sql = knex({ client: 'pg', connection: withoutUndefined({ host, port, database, user, password }) })
    // the five method bodies of src/index.js, verbatim, closing over `sql`
    return { createDocument, getCollection, getDocument, updateDocument, deleteDocument }
  }
})
```

## 5. Tests

### 5.1 Unit tests (`knex` mocked)

- **Descriptor** validation, including that `username` is now an unknown key.
- **Runtime:**
  - `create` passes the connection without `undefined` keys;
  - two `create` calls give two `knex` instances;
  - `createDocument` without `primaryKey.key` throws today's message.

### 5.2 `test/conformance.test.js` (opt-in)

Skip unless `GENOACMS_TEST_POSTGRES === '1'`. The connection comes from `PGHOST`, `PGPORT`,
`PGDATABASE`, `PGUSER` and `PGPASSWORD`, and the fixture from `test/fixture.js`
(`collections[0]`, `testDocuments`).

## 6. Steps

1. Move the fixture, update `package.json`, and run `pnpm install`.
2. Create the descriptor, runtime and tests.
3. Run §7.

## 7. Verification

```bash
pnpm install
pnpm --filter @genoacms/adapter-postgres run test
pnpm --filter @genoacms/adapter-postgres run test:conformance
git status --short
```

**Expected:**
- Unit tests pass, and the conformance run reports *skipped*.
- `git status` lists only files under `packages/adapter-postgres/` and `pnpm-lock.yaml`.

## 8. Critique

**Pros.**
- Two Postgres databases can be separate providers.
- The fixture's disagreement between `adapterPath` and its relative import (F3) disappears, because the fixture no longer names the adapter at all.

**Cons.** The `username` → `user` rename is visible to anyone who copied the old fixture. Nothing is
released, so the only such config is the fixture itself.

**Blindspots.**
- `knex` keeps a connection pool open, and with no `destroy` in the runtime contract a CLI command that constructs this provider may not exit on its own. No current CLI command constructs a database provider. If one is added, a `destroy` hook becomes necessary.
- The fixture collection uses `primaryKey` as an object while core's collections use a string. That drift is pre-existing and untouched.
