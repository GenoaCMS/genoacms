---
type: rfc
number: 46
title: The page marks when it is interactive, and the e2e tests wait for the mark
status: auditing
commits: [27f8eacd, 7493f44f]
audit: []
depends: [45]
architecture: [architecture/shell.md, README.md]
changes: [SHL-1 added]
commit-subject: "feat(core): mark a page interactive once hydrated, and wait for the mark in e2e (RFC-0046)"
---

# RFC-0046: The page marks when it is interactive, and the e2e tests wait for the mark

## Summary

Core's end-to-end tests wait for `networkidle` after every page load, so that a click lands on a
hydrated page. That wait lasts at least 500 ms after the last request, and in
`packages/core/e2e/components.test.ts` it is about a third of the file's 104 s (`shell.md` VD1). This
RFC makes the root layout set `data-hydrated` on `<html>` once the page has mounted (SHL-1), and
makes every e2e file wait for that attribute instead.

Two test-only changes go with it, and change no assertion: `registerPrebuilt` and
`registerDynamic` stop reloading the page `register` has just opened, and PUB-2 stops waiting for
the first toast to disappear before publishing again.

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/core/src/routes/+layout.svelte` | `onMount(() => { document.documentElement.dataset.hydrated = '' })`, with a `// SHL-1` reference |
| `packages/core/e2e/browser.ts` | new export `visit (page: Page, url: string): Promise<Response \| null>` |
| `packages/core/e2e/components.test.ts`, `pages.test.ts`, `configuration.test.ts`, `collections.test.ts`, `storage.test.ts` | the local `visit` replaced by the one from `browser.ts`; each `waitForLoadState('networkidle')` after a page load (a reload, a new window) replaced by `hydrated`; after a navigation inside the application, by a wait for the element the test reads next |
| `packages/core/e2e/components.test.ts` | `registerPrebuilt`, `registerDynamic` and PUB-2, as in the Summary |
| `packages/core/e2e/signIn.test.ts` | one test, SHL-1 |
| `docs/architecture/shell.md`, `docs/README.md` | the statement; Test line and Verification once the test passes |

`browser.ts` gains:

```ts
const HYDRATED = 'html[data-hydrated]'

/** SHL-1: resolves once the page in `page` is hydrated. */
export async function hydrated (page: Page): Promise<void>

/** Navigates, then waits until the page has hydrated, so a click lands on the live page. */
export async function visit (page: Page, url: string): Promise<Response | null>
```

A `networkidle` that waits for the requests of an action to end, not for a page to load, stays:
`pressAndWait` and the drag test in `pages.test.ts`, `rotate` in `configuration.test.ts`. The page is
already marked when they run, so the mark says nothing about the action (found while implementing,
2026-11-02).

`hydrated` waits for `HYDRATED` to be attached, with Playwright's default timeout of the call.
`visit` is `page.goto(url)` followed by `hydrated(page)`, and returns what `goto` returned. A
`page.reload()` that a test relies on before clicking is followed by `hydrated(page)`.

## Specification

New statement, as written in `shell.md`:

> #### SHL-1 · The page marks when it is interactive
>
> The HTML core serves for a page has no `data-hydrated` attribute on its `<html>` element. Once the
> page is hydrated, and every component of it is mounted, `<html>` has `data-hydrated` with the empty
> value. The attribute stays until the document is replaced: a navigation inside the application
> keeps it.

## Non-goals

- No wait for data a component loads after mounting. A test that reads such data waits for it, as
  it already does with `shown` or `expect.poll`.
- No other speed-up of the tests: they keep registering components through the registrar's dialog
  (decided 2026-11-02), and the server keeps starting once per file.
- The three waits for an action's requests keep `networkidle` (Files).
- The demo script, `packages/core/demo/demo.ts`, keeps `networkidle`; it runs against a dev server
  whose build may predate SHL-1.
- The rest of the shell stays unspecified.

## Tests

### `signIn.test.ts`, in `describe('without a session')`

**`SHL-1: a page is served without data-hydrated, and has it once hydrated, after an in-app navigation too`**
- *Given* the server, and no session.
- *When* `/` is fetched, *then* its body's `<html` tag has no `data-hydrated`.
- *When* `/` is opened in Chromium (`page.goto`, no other wait), *then* `html[data-hydrated]`
  is attached within 30 s and its value is `''`.
- *When* the landing page's `/login` link is then clicked, *then* the URL becomes `/login`
  without a new document (a value set on `window` before the click is still there), and `<html>`
  still has `data-hydrated`.

The other e2e files keep every title and every assertion. They pass with `visit` and `hydrated` in
place of `networkidle`.

## Steps

1. Write the SHL-1 test, marked `it.fails`. Commit `test(core): SHL-1 at e2e, expected to fail (RFC-0046)`.
2. Add the `onMount` to `src/routes/+layout.svelte`; remove the `it.fails` marker.
3. Add `visit` and `hydrated` to `browser.ts`; replace the local helpers and the `networkidle`
   waits in the e2e files; make the two `components.test.ts` changes of the Summary. Commit 2 and 3
   as `feat(core): mark a page interactive once hydrated, and wait for the mark in e2e (RFC-0046)`.
4. `shell.md`: Test line, `verified`, marker removed. `docs/README.md`: the row. RFC: `status:
   auditing`, `commits`. Commit `docs: SHL-1 current (RFC-0046)`.

## Verification

From `packages/core`, with GCP credentials in the environment:

```bash
GENOACMS_TEST_GCP=1 npx vitest run --mode e2e e2e
```

Every file passes, and `components.test.ts` takes at least 30 s less than the 104 s measured on
2026-11-02. From the repository root, `node docs/tools/check-docs.mjs docs` reports no errors, and
`node docs/tools/check-results.mjs docs reports/e2e/packages-core.xml` none for SHL-1.

## Critique

**Pros**
- About a third of the components file's time, and a similar share of the other browser files,
  goes, with no assertion changed.
- The wait states what the test needs, a live page, instead of a proxy for it.
- It survives a SvelteKit upgrade: the mark is the application's, not the framework's.

**Cons & trade-offs**
- An attribute in every page that only tests read.
- `networkidle` also covered requests made after mounting. A test that read such data without
  waiting for it passed by luck and may now fail; it is fixed by waiting for what it reads, not by
  restoring `networkidle`.

**Blindspots & missed edge cases**
- A screen whose child component mounts late, behind an `{#await}` or a lazy import, is marked
  before that child is live. No screen of core does this today.
- A page that fails to hydrate (a client error) is never marked, and the test times out after
  30 s, where `networkidle` let it go on and fail at its first assertion. The timeout names the
  wait, not the error; `pageErrors` in `components.test.ts` still records it.
- The demo script keeps the slow wait.
