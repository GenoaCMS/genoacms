# RFC-0010: Port `@genoacms/authentication-adapter-array`

| | |
| :-- | :-- |
| Status | Implemented (`b42ac17`) |
| Depends on | RFC-0001 |
| Architecture | §4 D2, D5; §8 (core's credentials via `inline()`) |
| Commit | `feat(authentication-adapter-array): add descriptor and runtime factory` |

## 1. Summary

Add a descriptor and a runtime factory next to `src/index.js`. The credential list becomes one
JSON-decoded `Secret` option, `credentials`. The every-subject-declared assertion runs in `create`,
because only there are the credentials resolved.

## 2. Files

**Create** (under `packages/authentication-adapter-array/`):

| File | Purpose |
| :-- | :-- |
| `src/descriptor.js`, `src/descriptor.d.ts` | §4.1 |
| `src/runtime.js`, `src/runtime.d.ts` | §4.2 |
| `src/descriptor.test.js`, `src/runtime.test.js` | §5 |

**Modify** `package.json`:
- add the dependency `"@genoacms/contracts": "workspace:^"`;
- add the dev dependency `"vitest": "^3.2.7"`;
- add the script `"test": "vitest run"`.

`exports` stay as today (none declared; `main` is `src/index.js`) until RFC-0014.

**Delete:** none.

## 3. Non-goals

- Do not modify `src/index.js` or `src/config.ts`.
- **Do not change the plain-text password comparison.** It is a known weakness, and fixing it is a separate task (architecture §3).

## 4. Specification

### 4.1 Descriptor

```ts
import type { Credentials } from './config.js'

export interface ArrayAuthenticationOptions {
  /** A JSON array of { subject, email, password }. */
  credentials: Secret<Credentials[]>
}
declare module '@genoacms/contracts' {
  interface AuthenticationAdapters { '@genoacms/authentication-adapter-array': ArrayAuthenticationOptions }
}
```

- `runtime: '@genoacms/authentication-adapter-array/runtime'`, `secretOptions: { credentials: 'json' }`.
- `validate` rejects unknown keys and a missing `credentials`. It cannot inspect subjects, because the value is unresolved there.

### 4.2 Runtime

```js
export default defineRuntime({
  create ({ credentials }) {
    if (!Array.isArray(credentials)) throw new Error('missing-credentials')
    assertEverySubjectDeclared(credentials)
    return { authenticate: async (email, password) => { /* body of authenticate in src/index.js, reading `credentials` */ } }
  }
})
```

`assertEverySubjectDeclared` is copied from `src/index.js` together with its doc comment.

## 5. Tests

- **Descriptor:** `kind === 'authentication'`, the `runtime` specifier, `secretOptions`, and validation of an unknown key and a missing key.
- **Runtime:**
  - a non-array value throws `missing-credentials`;
  - an entry without `subject` throws `missing-subject: <email>`;
  - the correct email and password resolve `{ subject, email }`;
  - a wrong password and an unknown email both resolve `null`;
  - two instances with different lists are independent.

## 6. Steps

1. Update `package.json` and run `pnpm install`.
2. Create the files.
3. Run §7.

## 7. Verification

```bash
pnpm install
pnpm --filter @genoacms/authentication-adapter-array run test
git status --short
```

**Expected:** tests pass, and `git status` lists only files under
`packages/authentication-adapter-array/` and `pnpm-lock.yaml`.

## 8. Critique

**Pros.** Credentials can move to the secret store (`secret('GENOACMS_ADMIN_CREDENTIALS')`), or stay
file-based through `inline()` (U7).

**Cons.** A JSON secret must be a single line in the development store, because `.env` values cannot
span lines. That is fine for minified JSON.

**Blindspots.** Plain-text passwords are now easier to move into a secret manager, which may give a
false sense that they are protected. The comparison itself is still plain text and not constant-time.
