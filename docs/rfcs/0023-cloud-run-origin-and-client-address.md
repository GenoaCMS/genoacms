# RFC-0023: Cloud Run functions honor ORIGIN and XFF_DEPTH

| | |
| :-- | :-- |
| Status | Draft |
| Depends on | RFC-0021 |
| Architecture | [`adapter-gcp/deployment.md`](../architecture/adapter-gcp/deployment.md) GD5 (GU4); ADP-1, ADP-5, ADP-6, ADP-7, DEP-14; GF7, GF11, GF14 |
| Commit | `feat(sveltekit-adapter-cloud-run-functions): honor ORIGIN and XFF_DEPTH, set by the gcp target` |

## 1. Summary

The SvelteKit adapter copies `env.js` but never reads it (GF14), returns the forgeable
`X-Forwarded-For` list as the client address (GF7), and its tests are disabled (GF11). This RFC:

1. moves request-URL and client-address logic into a pure module, `src/request.js`, and tests it;
2. makes the handler read `ORIGIN` and `XFF_DEPTH` through `env.js`, which now knows only those two;
3. adds the `origin` and `xffDepth` options to the `gcp` target, which set those variables on the function;
4. restores the adapter's `test` script and deletes the stale smoke test.

## 2. Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/sveltekit-adapter-cloud-run-functions/src/request.js` | **new**, §3.1 |
| `packages/sveltekit-adapter-cloud-run-functions/src/handler.js` | §3.2 |
| `packages/sveltekit-adapter-cloud-run-functions/src/env.js` | §3.3 |
| `packages/sveltekit-adapter-cloud-run-functions/tests/request.test.js` | **new**, §5 |
| `packages/sveltekit-adapter-cloud-run-functions/tests/smoke.spec.js` | **delete**: it imports `create_kit_middleware`, which no longer exists |
| `packages/sveltekit-adapter-cloud-run-functions/package.json` | `"test": "vitest run"` |
| `packages/adapter-gcp/src/deployment/settings.ts` | §3.4 |
| `packages/adapter-gcp/src/deployment/settings.test.ts` | §5 |

## 3. Specification

### 3.1 `src/request.js` (new)

Plain JavaScript with JSDoc types, Prettier-formatted like the rest of the package. It imports only
Node built-ins, so it can be tested without a build.

```js
/** Parses XFF_DEPTH. Undefined → 1. Throws for anything but a positive integer. */
export function parseXffDepth(value) // (string | undefined) => number

/** The request URL: ORIGIN + path and query when origin is set, else from the forwarded headers. */
export function requestUrl(req, origin) // (IncomingMessage, string | undefined) => string

/** The client address: the X-Forwarded-For entry `depth` from the right, or the socket address. */
export function clientAddress(req, depth) // (IncomingMessage, number) => string | undefined
```

- `parseXffDepth`: `undefined` returns `1`. A string matching `/^[1-9]\d*$/` returns its number. Anything else throws `Error(`XFF_DEPTH must be a positive integer, not '${value}'`)`.
- `requestUrl`: when `origin` is a string, return `new URL(req.url ?? '', origin).href`. Otherwise keep today's rule from `handler.js`: protocol from `x-forwarded-proto`, default `http`; host from `x-forwarded-host`, else `host`; `new URL(req.url ?? '', `${protocol}://${host}`).href`.
- `clientAddress`: read `x-forwarded-for`, joining an array with `,`. When the header is absent or empty, return `req.socket?.remoteAddress`. Otherwise split on `,`, trim each entry, drop empty entries, and return the entry at index `length - depth`. When `depth > length`, throw `Error(`XFF_DEPTH is ${depth}, but X-Forwarded-For has ${length} entries`)`.

### 3.2 `src/handler.js`

- Add `import { env } from 'ENV';` and `import { requestUrl, clientAddress, parseXffDepth } from './request.js';`.
- At module scope, after the imports: `const origin = env('ORIGIN', undefined);` and `const xff_depth = parseXffDepth(env('XFF_DEPTH', undefined));`, so a bad depth fails at startup.
- `parseRequest` builds `href` with `requestUrl(cloudRunRequest, origin)`. Its method, headers and body handling are unchanged.
- `getClientAddress` becomes `() => clientAddress(req, xff_depth)`.
- Remove the now unused local URL-building lines. Nothing else changes.

### 3.3 `src/env.js`

`expected` becomes `new Set(['ORIGIN', 'XFF_DEPTH'])`. `expected_unprefixed` becomes an empty set.
The prefix check and `env()` are otherwise unchanged.

### 3.4 `packages/adapter-gcp/src/deployment/settings.ts`

- `FunctionSettings` gains `origin?: string` and `xffDepth?: number`. `SETTING_KEYS` gains `'origin', 'xffDepth'` after `'serviceAccount'`.
- Two more rules, in that order after `serviceAccount`:
  - `origin`: valid when it matches `/^https?:\/\/[^/\s]+$/`. Reason: `origin must be an absolute http(s) origin such as 'https://cms.example.com'`.
  - `xffDepth`: valid when it is an integer ≥ 1. Reason: `xffDepth must be an integer of at least 1`.
- `serviceConfig`'s `environmentVariables` becomes `{ NODE_ENV: 'production', ...(origin ? { ORIGIN: origin } : {}), ...(xffDepth ? { XFF_DEPTH: String(xffDepth) } : {}) }`, using `=== undefined` checks like the other settings.

The descriptor needs no change: it allows every `SETTING_KEYS` entry and calls `validateSettings`.

## 4. Non-goals

- No other adapter-node variable (`PROTOCOL_HEADER`, `HOST_HEADER`, `ADDRESS_HEADER`, `BODY_SIZE_LIMIT`, …).
- No IPv6 normalization and no port stripping of addresses.
- No change to `adapt()`, the Rollup configuration or asset serving.
- No sign-in throttling (`configuration.md` Q5).
- No live check: GS5 is the author's.

## 5. Tests

**`tests/request.test.js`** (vitest), with requests built as plain objects `{ url, headers, socket }`:
1. `parseXffDepth(undefined)` is `1` and `parseXffDepth('2')` is `2`. `'0'`, `'-1'`, `'1.5'` and `'x'` throw `XFF_DEPTH must be a positive integer, not '<value>'`.
2. `requestUrl` without an origin uses `x-forwarded-proto` and `x-forwarded-host`, and falls back to `http` and `host`.
3. `requestUrl` with origin `https://cms.example.com` returns `https://cms.example.com/a?b=1` for `url: '/a?b=1'`, even when the forwarded headers name another host.
4. `clientAddress` with `x-forwarded-for: '203.0.113.9, 198.51.100.7'` returns `198.51.100.7` at depth 1 and `203.0.113.9` at depth 2.
5. `clientAddress` at depth 3 on that header throws `XFF_DEPTH is 3, but X-Forwarded-For has 2 entries`.
6. `clientAddress` without the header returns `socket.remoteAddress`.

**`settings.test.ts`:** add three cases.
- `origin: 'https://cms.example.com'` and `xffDepth: 2` validate, and map to `environmentVariables: { NODE_ENV: 'production', ORIGIN: 'https://cms.example.com', XFF_DEPTH: '2' }`.
- `origin: 'https://cms.example.com/'` and `origin: 'cms.example.com'` yield the origin reason, and `xffDepth: 0` yields the depth reason.
- The existing `serviceConfig({})` case still equals the old value, so no variable is set by default.

## 6. Steps

1. Baseline: `pnpm --filter @genoacms/adapter-gcp test` has 38 passing and 1 skipped; the adapter's `check` and `lint` pass.
2. §3.1 with `tests/request.test.js`; delete `tests/smoke.spec.js`; set the `test` script.
3. §3.2 and §3.3.
4. §3.4 with its tests.
5. Run §7.

## 7. Verification

From the repository root:

```bash
pnpm --filter @genoacms/sveltekit-adapter-cloud-run-functions test 2>&1 | grep -E "Tests|Test Files"
pnpm --filter @genoacms/sveltekit-adapter-cloud-run-functions run check 2>&1 | tail -2
pnpm --filter @genoacms/sveltekit-adapter-cloud-run-functions run lint 2>&1 | tail -1
pnpm --filter @genoacms/sveltekit-adapter-cloud-run-functions run build 2>&1 | tail -1
grep -c "requestUrl\|clientAddress" packages/sveltekit-adapter-cloud-run-functions/files/handler.js
pnpm --filter @genoacms/adapter-gcp test 2>&1 | grep -E "Tests|Test Files"
```

**Expected:** the adapter's tests pass, 6 of them; `check` and `lint` pass; the built
`files/handler.js` contains the new functions, so the count is at least 2; adapter-gcp has 41 passing
and 1 skipped.

The production build of core still builds and packs the adapter. Run from `packages/core`:

```bash
node ../cli/src/index.js build gcp --config genoa.config/production.ts 2>&1 | grep -E "config/invalid|Packed into the artifact" | cut -c1-40
```

**Expected:** `Packed into the artifact` and no `config/invalid`.

**GS5 (author, live):** architecture `deployment.md` §6.

## 8. Critique

**Pros.**
- The address and origin rules become testable, because they no longer sit behind build-time placeholders, and GF11's dead suite is replaced by one that runs.
- A bad `XFF_DEPTH` stops the function at startup instead of attributing every request wrongly.

**Cons & trade-offs.**
- `handler.js` now depends on `env.js`, which `adapt()` already copies. The two files must stay in the same output, as they are.

**Blindspots.**
- The handler's wiring of the pure functions is not unit-tested, because `handler.js` imports the build-time placeholders `SERVER` and `MANIFEST`. The check that the built bundle contains the functions, plus GS5, are what cover it.
