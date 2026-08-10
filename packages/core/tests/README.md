# Tests for `@genoacms/core`

Two suites, with very different requirements.

## Unit tests — Vitest

```bash
pnpm --filter @genoacms/core run test:unit      # once
pnpm --filter @genoacms/core run test:unit:watch
```

Live next to the code as `*.test.ts` under `src/`, and are picked up by the
`test.include` glob in `vite.config.ts`. They need **no credentials and no
running server**, so they are the suite worth gating CI on.

What is covered today:

| file | covers |
| --- | --- |
| `src/lib/script/schema.test.ts` | `asSchemaObject` / `isNullable`, including that OpenAPI's `nullable` is *not* treated as nullable |
| `src/lib/script/components/componentEntry/component/attributeInits.test.ts` | every new-attribute init validates against its runtime JSON Schema **after a JSON round-trip** |
| `src/lib/script/components/editor/analyzer.test.ts` | deriving attributes from component source, and uid preservation across re-analysis |

### Why the round-trip matters

`attributeInits.test.ts` exists because of a real regression. Unset numeric
constraints must be `null`, never `undefined`: attributes are `JSON.stringify`d
before being validated against `componentEntrySchema` and stored, and
`JSON.stringify` **drops undefined keys**. Several of those keys are `required`
in the meta-schemas, so an attribute built with `undefined` silently fails
validation and the editor reports only "Invalid data".

The suite asserts both that each init validates *and* that no key disappears
through serialisation, plus one test proving the `undefined` form really does
fail — so the guard cannot rot into a no-op.

### Writing new unit tests

Keep them clear of anything that reaches `genoa.config`. Importing it pulls in
the provider SDKs and requires real credentials, which is what stops most of
core from being unit-testable today.

## End-to-end tests — Playwright

```bash
pnpm --filter @genoacms/core run test:integration
```

⚠️ **These need provider credentials.** `playwright.config.ts` boots the app with
`pnpm run build && pnpm run preview`, and core's `vite build` authenticates
against the configured provider — so without a valid
`genoa.config/gcp/serviceAccount.json` the web server never starts and every
test fails on timeout.

That is also why CI does not run them. Decoupling the build from provider
credentials would make this suite runnable on a runner.

`tests/smoke.spec.ts` covers only unauthenticated surface: the landing page, the
link to login, the login form, and that `/dashboard` redirects away without a
session. Anything past login needs a seeded user, which does not exist yet.
