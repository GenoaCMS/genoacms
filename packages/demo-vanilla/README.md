# GenoaCMS consumer demo — plain JavaScript

One CMS-authored page, fetched, verified and rendered by a plain JavaScript application holding nothing but a
32-byte public key.

One of four demos that render the same page from the same SDK. They differ **only** in the wrapper.

## The two directories, and why they are separate

| | |
| :--- | :--- |
| **`src/genoa/`** | **Boilerplate.** The wrapper that turns the SDK's resolved tree into plain JavaScript components. You copy this once and rarely touch it. Here it is **nothing** — `renderResolved` already returns a DOM node, so there is no wrapper to write. |
| **`src/components/`** | **Yours.** Ordinary plain JavaScript components that know nothing about GenoaCMS, plus the map saying which published component each one implements and in what order its values arrive. |

Everything shared with the other three demos — fetching, verifying, and reading the bucket — lives in
`@genoacms/demo-support`, so none of it is in either directory.

[`packages/sdk/WRAPPERS.md`](../sdk/WRAPPERS.md) explains how to write the `genoa/` half for a
framework that has no demo here, and carries a prompt you can hand to an LLM to write it for you.

## Running it

```bash
cp .env.example .env      # every setting is described in it
pnpm --filter @genoacms/demo-vanilla dev
```

You need the instance's root public key (CMS → *Configuration → Keys → Root trust anchor*) and a
published page. `pnpm --filter @genoacms/core run test:demo` publishes `demoHome`, `demoFlat` and
`demoEmpty`; `test:demo:clean` removes them again.

If a setting is missing, or the page is not published, or a component is not in your map, the page
says so and says what to do about it rather than rendering blank.

## The component contract

A published component's attributes are **positional** — the signed `attributeOrder` decides which
value is which. Your components take named props. `src/components/` holds the map between them:

```ts
demoCard: { component: DemoCard, props: ['title', 'body'] }
```

That list must match what the CMS published. Nothing enforces it: get it out of step and the right
values land in the wrong props **with every signature still valid**. On the CMS's side that mistake
is impossible by construction; on this side it is an ordinary bug.
