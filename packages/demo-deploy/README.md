# Deploying the consumer demos

Four Firebase Hosting sites, one per demo, and one functions codebase.

**Deployed.** All four render the `demoHome` tree, four levels deep, from the live instance:

- https://genoacms-demo-svelte.web.app
- https://genoacms-demo-react.web.app
- https://genoacms-demo-vue.web.app
- https://genoacms-demo-vanilla.web.app

| site | what it serves |
| :--- | :--- |
| `genoacms-demo-svelte` | Static assets, with everything else rewritten to **`demoSvelte`** — server-rendered. It serves `/artifacts` from its own route. |
| `genoacms-demo-react` | Static. `/artifacts/**` → **`artifacts`**, everything else → `index.html`. |
| `genoacms-demo-vue` | Static, same. |
| `genoacms-demo-vanilla` | Static, same. |

## No deployed demo holds a credential

Both functions call `new Storage()` with no arguments — Application Default Credentials, which on
Cloud Functions is the function's own service-account identity. There is no service-account JSON in
this repository, in the deployed bundle, or in an environment variable. Access is an IAM grant on the
bucket, so revoking it is an IAM change rather than a redeploy.

The browsers hold only the root public key, which is public by construction and is what verification
is for. **Every signature is checked in the browser**, so neither function has to be trusted: if one
lied about a document, the browser would refuse it.

Both are temporary. Once publish mirrors copy the published directory somewhere public, the
`artifacts` function and the SvelteKit route are deleted and each demo points
`VITE_GENOACMS_ORIGIN` at the mirror.

## Why SvelteKit is a function and the other three are not

The SvelteKit demo has a real server route at `routes/artifacts/[...path]`. `adapter-static` refuses
it — every route must be prerenderable — so it is built with
**`@genoacms/sveltekit-adapter-cloud-run-functions`**, this repository's own adapter, and run as a
function. `svelte-adapter-firebase` is deliberately not used; that adapter is why this one exists.

The other three are single-page applications with nothing to render on a server, so they are static
and reach the shared `artifacts` function through a rewrite.

**Rewrite order matters.** `/artifacts/**` is listed before the `**` fallback: reversed, the
catch-all would swallow every artifact request and answer it with `index.html`, which the SDK reports
as unreachable storage rather than as a missing document.

## The allowlist and the reader are copied, not restated

`functions/artifacts.js` and `functions/bucket.js` are `@genoacms/demo-support`'s compiled allowlist
and bucket reader, placed there by `build.sh`. Firebase uploads this directory and installs from its
own `package.json`, so a `workspace:*` dependency would not resolve — and rewriting either by hand
would mean two copies of the one decision keeping drafts, component source, user records and the
authorization manifests inside a private bucket. One rule, one reader, one set of tests.

The reader is copied because the first deploy proved the point: `functions/index.js` carried **its
own** reader using the ambient identity, while the shared one refused to start without a
service-account JSON. The three static demos worked and the SvelteKit route answered `500` to every
request. The reader now treats an absent credential as *use the ambient identity*, which is true both
on a developer's machine and on a function.

## The deploy is gated on not shipping the service account

`leakcheck.mjs` runs as a `predeploy` hook on **every** entry in `firebase.json`, so a partial deploy
(`firebase deploy --only hosting:genoacms-demo-react`) is gated too. `$RESOURCE_DIR` is the directory
about to be uploaded, so each unit checks its own bytes, and a non-zero exit stops the deploy before
anything is uploaded.

It exists because the demos read a **private** bucket, so each `packages/demo-<framework>/.env` holds
a real service-account key, and `artifactProxy()` calls `loadEnv(mode, root, '')` — the empty prefix,
which deliberately reads every variable including that one — during `vite build` as well as
`vite dev`. The secret is therefore in the build process's memory every time a demo is built. What
keeps it out of the bundle is that Vite inlines `import.meta.env.VITE_*` and nothing else: a property
of a bundler's behavior, not of anything this repository controls. One `define`, or one plugin trying
to be helpful, would end it silently — and a published key is rotated, not edited away.

It searches for the **actual credential**, taken from the `.env` files, rather than for the word
`private_key`, in four encodings: raw, JSON-escaped, whitespace-stripped, and base64 of the whole
credential. A bundler that re-encoded the value would pass a check written the obvious way.

Two refusals are worth knowing about, because both are cases where a naive check would report
success:

- **No `.env` anywhere** exits `2`, not `0`. With no credential to search for the scan proves
  nothing, and a checkout without one is exactly where a silent "clean" would mislead most.
- **A needle that cannot fire** exits `2`. Before scanning, it plants the credential in every
  encoding and requires every needle to match. Writing this the obvious way produced a needle cut
  from the whitespace-stripped key, blind to a bundle that kept its newlines — it would have called a
  full leak clean. The self-test caught it, and runs on every invocation.

Verified end to end: with a key planted in `public/react`, `firebase deploy` stops with
`hosting predeploy error` and uploads nothing.

## Configuration the functions read

`build.sh` writes `functions/.env` with `GENOACMS_BUCKET`, and `firebase deploy` turns it into
runtime environment variables. It is generated rather than committed because `.env` is gitignored
across this repository — a checked-in one would be missing from a fresh clone and the deploy would
come up unconfigured. It holds no secret: a bucket name, and an identity is still needed to read it.

## Building

```bash
VITE_GENOACMS_ROOT_PUBLIC_KEY='…' ./build.sh
```

Takes the key from the CMS under *Configuration → Keys → Root trust anchor*, and defaults
`VITE_GENOACMS_PAGE` to `demoHome`. Both are baked into each bundle, which is correct for both: a
consumer's trust anchor is a build-time constant by design.

Output:

- `public/{svelte,react,vue,vanilla}` — one Hosting root per site.
- `functions/svelte` — the adapter's server output, minus what Hosting serves.
- `functions/artifacts.js`, `functions/bucket.js` — the copied allowlist and reader.
- `functions/.env` — `GENOACMS_BUCKET`.

`public/svelte` has **no `index.html`**, and should not: the HTML comes from `demoSvelte`. Hosting
serves the assets under `_app/` and everything else falls through to the function.

## Deploying

The four sites already exist. Recreating the project from scratch needs them first:

```bash
firebase hosting:sites:create genoacms-demo-svelte
firebase hosting:sites:create genoacms-demo-react
firebase hosting:sites:create genoacms-demo-vue
firebase hosting:sites:create genoacms-demo-vanilla
```

Then, from this directory:

```bash
firebase deploy
```

`hosting.site` is named on every entry. The project's **default** site is `genoacms`, which serves
something else — an entry without a `site` would overwrite it.

The functions' service account needs read access to the instance's bucket. On this project no grant
was necessary — the functions run as the default compute service account, which already reads the
`genoacms` bucket. Deploying into a project where it does not, or narrowing that identity later,
needs `roles/storage.objectViewer` on the bucket. Without it every artifact request answers `502` and
the demos report that storage could not be reached — which is the honest answer, and is what tells
you the grant is missing.
