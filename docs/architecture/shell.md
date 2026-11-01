---
type: architecture
title: The page shell in core
prefix: V
codes: [SHL]
verified: a6383223
---

# The page shell in core

## Design

### Role

What every page core serves has in common, whatever screen it shows: today only the mark that
says the page is interactive, which the end-to-end tests wait for.

```
server HTML ── <html> without data-hydrated
                 │ SvelteKit starts, every component of the page mounts
                 ▼
               <html data-hydrated="">   (until the document is replaced)
```

Out of scope, and not yet specified: the layouts, the navigation bar and its mobile variant, the
navigation progress bar, the toasts and the alert dialogs. Today only the code describes them.

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| VU1 | 2026-11-02: the end-to-end tests learn that a page is interactive from a mark the page sets, not from the network falling quiet, and not from SvelteKit's internals (RFC-0046). | VD1, SHL-1 |

**VD1. The page marks itself interactive (SHL-1).** The root layout sets `data-hydrated` on
`<html>` once the page has mounted.
*Why:* a click on server-rendered HTML before hydration is lost, so a test has to know when the
page is live. SvelteKit leaves no sign of it in the DOM. Waiting for the network to fall quiet costs
at least 500 ms per page load: measured on 2026-11-02, opening the registrar took 173 ms to `load`
and 681 ms to `networkidle`, and the components file opens about 70 pages, about a third of its
104 s. A hook into SvelteKit's router depends on code that is not its API and may change with any
release.
*Cost:* every visitor's page carries an attribute only tests read. It says nothing about data a
component loads after mounting, so a test still waits for what it reads.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| VF1 | **The e2e tests spend about a third of their time waiting for the network to fall quiet.** Each page load waited for `networkidle`, at least 500 ms after the last request. Measured on 2026-11-02 against core built with `genoa.config/e2e.ts`: the registrar reached `load` in 173 ms and `networkidle` in 681 ms, the code editor in 350 ms and 857 ms. `components.test.ts` opens about 70 pages in its 104 s. | open; RFC-0046 |

### History

*History.* Until RFC-0046 the end-to-end tests waited for `networkidle` after every navigation.

### Verification

- **`e2e`.** `packages/core/e2e/signIn.test.ts` reads the server's HTML of `/login` and opens it in
  Chromium.

## Specification

### Interactivity

#### SHL-1 · The page marks when it is interactive

The HTML core serves for a page has no `data-hydrated` attribute on its `<html>` element. Once the
page is hydrated, and every component of it is mounted, `<html>` has `data-hydrated` with the empty
value. The attribute stays until the document is replaced: a navigation inside the application
keeps it.

- Test: none yet
- Level: e2e
- State: new (RFC-0046)
