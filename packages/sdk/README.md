# `@genoacms/sdk`

The client SDK for GenoaCMS. It reads what a CMS instance has published, verifies every signature
against the instance's root public key, and renders published pages in the browser.

It needs two things: the instance's **root public key**, 32 bytes you embed at build time, and a way
to **read** the instance's storage. It holds no credentials, calls no GenoaCMS service and names no
storage vendor.

```bash
npm install @genoacms/sdk
```

## Rendering a page

```ts
import { Verifier, fromBase64, httpSource, renderPage } from '@genoacms/sdk'

const rootPublicKey = fromBase64('<the root public key, as the CMS shows it>')
if (rootPublicKey === undefined) throw new Error('the root public key is not base64')

const verifier = new Verifier({
  rootPublicKey,
  source: httpSource('https://storage.example.com/cms-bucket')
})

const page = await verifier.pageTree('home')
if (page === undefined) throw new Error('nothing is published as "home"')
if (!page.valid) throw new Error(`the page did not verify: ${page.reason}`)

const rendered = await renderPage(verifier, page.value, { components: { /* your prebuilt components */ } })
if (rendered.ok) document.body.append(rendered.value)
```

The root key is shown in the CMS under *Configuration → Keys → Root trust anchor*, as base64. It is
the whole trust decision: rotating the root means rebuilding every consumer with the new key.

## Three answers, and only one throws

- **`undefined`**: nothing is published at that path.
- **`{ valid: false, reason }`**: something is there and it did not verify, malformed signatures
  and documents included. Do not render it in any form.
- **A throw**: the answer could not be reached. The SDK throws `UnreachableError` when the instance
  has no key registry or an object is not JSON at all; a network failure in `httpSource` throws
  whatever `fetch` throws. None of these is a verdict about any document: do not treat them as
  invalid, or an outage rejects good content.

`httpSource(baseURL)` reads `<baseURL>/<path>` with `fetch`: a 404 is `undefined`, any other
unsuccessful status throws. For a private bucket, pass your own `source`, an object with
`read(path): Promise<string | undefined>` built on the client you already have.

## Rollback

A signature says a document came from the instance, not when. A `Verifier` keeps the highest key
registry `sequence` it has seen and refuses an older registry, but only for its own lifetime: a new
page load starts with no memory of it. Persisting it is up to you.

## Components

A page node is either a **prebuilt** component, whose code lives in your application and which you
pass in `components`, keyed by the name it was published under, or a **dynamic** component, authored
in the CMS and executed from its signed bundle. `renderPage` refuses a page that uses a prebuilt
component you did not supply.

Dynamic components cannot reach globals or import packages. They reach the network only through a
bridge compiled into their signed bundle, which allows the origins the CMS signed into it and no
others; the `fetch` option sets what that bridge calls, for headers or a proxy, and cannot widen the
list. Whatever you put in the `passthrough` option is handed to every one of them, so what goes
there is your security decision: passing your own `fetch` there gives every CMS-authored component
the whole network.

A node whose code fails is left out and reported in `rendered.failures`; the rest of the page renders.

## Two entry points

- `@genoacms/sdk`: fetching, verifying, resolving (`resolvePage`) and rendering (`renderPage`,
  `renderResolved`). Rendering uses the page's `document`; on a server, pass one in the `document`
  option.
- `@genoacms/sdk/verify`: fetching and verifying only. Nothing in it touches the DOM or executes
  code, so a server can use it without shipping an executor.

To render through React, Vue, Svelte or another framework, resolve the page with `resolvePage` and
write a small wrapper:
[`WRAPPERS.md`](https://github.com/GenoaCMS/genoacms/blob/main/packages/sdk/WRAPPERS.md) explains
how. The
[consumer guide](https://genoacms.js.org/guide/consumer/) covers every option.
