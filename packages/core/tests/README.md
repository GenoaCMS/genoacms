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
| `src/lib/script/components/componentHeader/component/attributeInits.test.ts` | every new-attribute init validates against its runtime JSON Schema **after a JSON round-trip** |
| `src/lib/script/components/editor/analyzer.test.ts` | deriving attributes from component source, and uid preservation across re-analysis |

### Why the round-trip matters

`attributeInits.test.ts` exists because of a real regression. Unset numeric
constraints must be `null`, never `undefined`: attributes are `JSON.stringify`d
before being validated against `componentHeaderSchema` and stored, and
`JSON.stringify` **drops undefined keys**. Several of those keys are `required`
in the meta-schemas, so an attribute built with `undefined` silently fails
validation and the editor reports only "Invalid data".

The suite asserts both that each init validates *and* that no key disappears
through serialization, plus one test proving the `undefined` form really does
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
session.

Everything else goes past login, signing in as the account declared in
`genoa.config/gcp/authCredentials.js` — the array authentication adapter serves
it and `authorization.assignments` grants it `Administrator`, so the "seeded user"
this file used to say did not exist is simply the configured one. `signIn` and
the fixture naming live in `tests/support/session.ts`.

| suite | covers |
| --- | --- |
| `grantEditor.spec.ts` | the role editor: permission combobox, resource and field switches, re-opening a saved editor |
| `storage.spec.ts` | directories, uploads, renaming, selection and deletion |
| `collections.spec.ts` | the document round trip: create, edit, persist, delete |
| `components.spec.ts` | the prebuilt catalog, and the dynamic editor through commit |
| `pages.spec.ts` | creating a page, its preview URL, saving content, and publishing |
| `keys.spec.ts` | the signing key registry: the root anchor, rotation, revocation |

### How `keys.spec.ts` revokes without wrecking the instance

Revocation is permanent and reaches backwards — every signature the key ever made stops verifying —
so the suite applies the same rule as every other fixture: **it destroys only what it made.** The
revocation test rotates first, which mints a key and supersedes it moments later, then revokes that
key. Nothing published earlier was signed with it.

Keys are the one fixture with no `e2e-` prefix, because nobody names them: a `keyId` derives from
the key itself. Rotation is additive and superseded entries are never removed, so a run leaves two
more rows in the registry — one superseded, one revoked — and nothing to clean up.

### A whole class of defect these suites cannot see

They run against `pnpm build && pnpm preview`. **The dev server is a different program**, and a
defect that exists only there is invisible here. One did: the development secrets adapter writes
`.env`, Vite watches the env files and restarts on a change, so every secret write killed the
request that made it — rotating a key reported failure while the server appeared to crash, and
revoking one published the revocation and *then* died, reporting a failure that had not happened.
This suite passed the whole time.

The fix is `envDir: false` in `vite.config.ts`, and the guard is `src/viteConfig.test.ts` — at the
level where the cause lives, since no browser test driven at the preview build could ever reach it.
Before adding an e2e test for something, it is worth asking whether the thing it guards is even
present in the program the suite runs.

### Flakiness

The config allows **one retry**, because these suites drive real cloud storage:
listing and read-after-write are eventually consistent, so a write can succeed
and the next read still miss it. The helpers retry the reads known to lag — page
creation and the page list, which otherwise serve a 500 while an entry settles —
and the retry covers the rest. Playwright reports a retried pass as *flaky*, so
nothing is hidden. A test that fails twice is a real failure, and a rising flaky
count means finding the lagging read rather than raising the retry count.

### Fixtures

Every fixture these suites create is named with an **`e2e-` prefix** and a random
suffix, and each test removes its own in `afterEach`. Nothing without that prefix
is ever selected, renamed or deleted, so a test can only destroy what it made.
Anything an interrupted run leaves behind is identifiable at a glance and safe to
remove by hand.

Two cleanups deliberately go **around** the interface, through the storage
browser, because the interface cannot do them:

- **Pages** have no delete action at all. `pages:delete` is in the permission
  taxonomy with nothing consuming it, so `pages.spec.ts` removes the objects
  under `.genoacms/pages/` itself. Publishing writes a readable tree, which the
  same cleanup removes.
- **Dynamic components** cannot be deleted — see the defect below — so
  `components.spec.ts` removes their objects under `.genoacms/components/`,
  including the prebuilt entry that creating one also registers.

Both depend on the storage layout in `page.server.ts` and `editor/io.ts`, and are
the first thing to check if fixtures start accumulating. Walk the storage browser
by **clicking**, never by building a URL: paths are encoded with a `|->`
delimiter, and a wrong URL lands somewhere empty while appearing to succeed —
which is how the first version of this cleanup did nothing at all.

### A defect these tests found, left failing on purpose

**Deleting a dynamic component always reports success and never deletes.** The
confirmation input in `editor/[componentId]/DeleteComponent.svelte` has no `name`
attribute, so the typed name never reaches `delete.remote.ts`, which refuses
because the name it received does not match. The client then shows
"Component deleted" regardless, because its `enhance` handler never looks at what
the server returned.

`components.spec.ts` marks that test `test.fail()` rather than deleting or
weakening it: the assertion is what the feature is supposed to do, and Playwright
will report it as an unexpected **pass** the moment the form is fixed.

### Why the grant editor is tested here rather than in Vitest

Because the failure it guards against is invisible to everything else. Skeleton's
`Switch` renders its visible parts as decoration and a **visually hidden input**
as the real control. Omitting `Switch.HiddenInput` produces a switch that looks
correct, compiles, passes `svelte-check` and `eslint`, and leaves every unit test
green — while nothing on the screen can be clicked. That shipped once. Only
driving a browser catches it.

Two habits keep the suite honest:

- **It writes as little as possible.** Every assertion reads the editor's hidden
  `grants` field, which is derived from the rows as they are edited, so most
  tests never submit a form. The suite runs against real buckets and a real
  Firestore.

  The exception is the `reopening an editor` group, which *has* to save: the bug
  it guards against only appears once a save has reloaded the page data. Those
  tests create a role of their own (`e2e-grant-reload`) rather than touching an
  existing one, and an `afterEach` removes it whether or not the test got that
  far. If you ever see that role in the interface, a run was interrupted — it is
  safe to delete.
- **It is mutation-tested like the security guards are.** Deleting one
  `Switch.HiddenInput` must fail it (last checked: 6 tests fail), and removing
  the `{#if open}` from `Modal.svelte` must fail the reopen test.

### The second failure it caught, and the fix it led to

The grant editor keeps its rows as local state, seeded once from its prop, and
`Modal` used to render its children whether or not it was open. Saving a role
therefore changed the stored grants and reloaded the page data while the editor
went on showing the rows it was built with — so reopening it looked empty until
the page was refreshed.

That was fixed at the cause: `Modal` now mounts its contents only while open, so
every modal in the app is re-seeded on open by construction rather than by each
caller remembering to. The reopen tests are what made that change safe to
make — and what would catch it regressing.

Locators follow the *rendered* DOM rather than the component names, and the file
says why at the top — a switch is a `<label>` wrapping a checkbox, combobox
content is portalled to `<body>`, options are addressed by `data-value` because
their labels are trimmed of shared segments, and every role card on the page
mounts its own editor so several closed listboxes exist at once.
