# GenoaCMS consumer demo — SvelteKit

One CMS-authored page, fetched, verified and rendered by a SvelteKit application holding nothing but a
32-byte public key.

One of four demos that render the same page from the same SDK. They differ **only** in the wrapper.

## The two directories, and why they are separate

| | |
| :--- | :--- |
| **`src/genoa/`** | **Boilerplate.** The wrapper that turns the SDK's resolved tree into SvelteKit components. You copy this once and rarely touch it. Here it is `src/genoa/` — `GenoaComponent.svelte`, `GenoaChildren.svelte`, `DomSubtree.svelte`, `context.ts`. |
| **`src/components/`** | **Yours.** Ordinary SvelteKit components that know nothing about GenoaCMS, plus the map saying which published component each one implements and in what order its values arrive. |

Everything shared with the other three demos — fetching, verifying, and reading the bucket — lives in
`@genoacms/demo-support`, so none of it is in either directory.

[`packages/sdk/WRAPPERS.md`](../sdk/WRAPPERS.md) explains how to write the `genoa/` half for a
framework that has no demo here, and carries a prompt you can hand to an LLM to write it for you.

## Running it

```bash
cp .env.example .env      # every setting is described in it
pnpm --filter @genoacms/demo-svelte dev
```

You need the instance's root public key (CMS → *Configuration → Keys → Root trust anchor*) and a
published page. `pnpm --filter @genoacms/core run test:demo` publishes `demoHome`, `demoFlat` and
`demoEmpty`; `test:demo:clean` removes them again.

If a setting is missing, or the page is not published, or a component is not in your map, the page
says so and says what to do about it rather than rendering blank.

## What SvelteKit adds

The published documents are served by a **real route** — `src/routes/artifacts/[...path]/+server.ts` — rather than by the dev-server middleware the
other three use. A route survives `vite build`, so this demo can be built and previewed the way
it would actually be deployed.

The page is fetched in the browser and **not in `load`**, deliberately. SvelteKit would happily
verify on the server and send the result down — and that is exactly what must not happen here.
The claim is that a consumer verifies *for itself*; a page that arrived already verified has had
that done on its behalf by something the browser cannot check.

## The component contract

A published component's attributes are **positional** — the signed `attributeOrder` decides which
value is which. Your components take named props. `src/components/` holds the map between them:

```ts
demoCard: { component: DemoCard, props: ['title', 'body'] }
```

That list must match what the CMS published. Nothing enforces it: get it out of step and the right
values land in the wrong props **with every signature still valid**. On the CMS's side that mistake
is impossible by construction; on this side it is an ordinary bug.
