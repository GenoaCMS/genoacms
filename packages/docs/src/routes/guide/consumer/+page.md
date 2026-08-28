---
title: Rendering pages in your app
---

A **consumer** is an application that renders pages authored in GenoaCMS. It is not a plugin and it
does not run inside the CMS: it is your own application, in your own framework, which fetches
published documents and renders them.

It needs exactly two things:

1. the instance's **root public key**, 32 bytes, embedded at build time;
2. a way to **fetch bytes** from where the instance publishes.

No account, no API token, no vendor SDK, no clock. Everything below follows from those two.

```bash
npm install @genoacms/sdk
```

## The shortest consumer that works

```js
import { Verifier, httpSource } from '@genoacms/sdk/verify'
import { renderPage } from '@genoacms/sdk'

const verifier = new Verifier({
  rootPublicKey: myRootKey,          // Uint8Array, 32 bytes
  source: httpSource('https://cdn.example.com')
})

const page = await verifier.pageTree('home')
if (page === undefined) throw new Error('never published')
if (!page.valid) throw new Error(page.reason)

const rendered = await renderPage(verifier, page.value, {
  components: { Hero, Card }        // your own components, keyed by name
})

if (rendered.ok) document.body.append(rendered.value)
```

`renderPage` returns a **DOM node**. If you render with a framework instead, see
[resolving without rendering](#Resolving-without-rendering) below.

## Where the root key comes from

Your instance's administrator reads it from **Configuration → Signing keys → Root trust anchor**,
where it is shown as base64. It is public by construction — publishing it is what it is for — so it
belongs in your bundle:

```js
const myRootKey = Uint8Array.from(atob(import.meta.env.VITE_ROOT_PUBLIC_KEY), c => c.charCodeAt(0))
```

:::caution[The root key is a build-time constant, deliberately]
Fetching it at runtime would mean trusting whatever answered, which is the thing verification exists
to avoid. Rotating a root key therefore means **redeploying every consumer** — which is why
subordinate keys exist and do the day-to-day signing. See [signing keys](/guide/signing-keys/).
:::

## Where the bytes come from

`Source` is one method:

```ts
interface Source {
  read: (path: string) => Promise<string | undefined>
}
```

The SDK decides every path, the order they are read in, and what each is verified as. You supply
only *how* bytes are obtained — which is the part that depends on where your instance publishes and
who may read it.

**The two failure shapes are different answers and must stay apart:**

| Situation | Return |
| :--- | :--- |
| Nothing is stored at that path | `undefined` |
| Storage could not be reached | **throw** |

Returning `undefined` for an outage would make every page look unpublished during an incident.
`httpSource` gets this right for you: 404 is `undefined`, any other unsuccessful status throws
`UnreachableError`.

Reading a private bucket is a `Source` too:

```js
const source = {
  read: async (path) => {
    const [contents] = await bucket.file(path).download().catch(error => {
      if (error.code === 404) return [undefined]
      throw error
    })
    return contents?.toString('utf8')
  }
}
```

## Three answers, and only one of them throws

Every verification method returns a `Verdict` — **valid** or **invalid**. Malformed input is
*invalid*, not an exception: an SDK that raised on a truncated signature would turn a failed
verification into a crashed request.

```js
const page = await verifier.pageTree('home')

if (page === undefined) { /* never published — an ordinary state */ }
else if (!page.valid)   { /* it exists and did not verify — page.reason says why */ }
else                    { /* page.value is a verified tree */ }
```

Only **failing to fetch** throws, as `UnreachableError`. That is not a verdict about any document,
and treating it as one in either direction is a bug: as invalid, you reject good pages whenever the
network falters; as valid, you accept anything during an outage.

:::caution[A tree that does not verify is not returned in any form]
There is no degraded shape to fall back to. The plausible tampering repoints a node at a different
component, or at an older revision of the same one, and leaves a document that looks entirely
ordinary. Rendering it would be rendering whatever was written to the bucket.
:::

## Supplying your own components

Components authored as **prebuilt** have no code in the CMS — the CMS publishes a signed
*description* of what they accept, and the code stays in your application. You supply them by name:

```js
await renderPage(verifier, page.value, { components: { Hero, Card } })
```

The key is the component's **published name**, not the name your page happened to use.

Two mistakes are checked up front and **fail the whole page** rather than one node: a component you
did not supply, and a name bound to something that is not a function. Both are facts about your
application rather than about the documents, and every other node of that component would fail
identically.

You can ask before rendering:

```js
import { resolvePage, componentsUsed, missingComponents } from '@genoacms/sdk'

const resolved = await resolvePage(verifier, page.value)
componentsUsed(resolved.value)                       // every name this page needs
missingComponents(resolved.value, Object.keys(mine)) // the ones you have not supplied
```

**Dynamic** components are the other kind: their code was authored in the CMS, compiled, signed, and
is executed by the SDK. You supply nothing for them.

## Resolving without rendering

`renderPage` produces DOM. If your components are React, Vue or Svelte components rather than
functions returning nodes, stop one step earlier:

```js
import { resolvePage, isChildren } from '@genoacms/sdk'

const resolved = await resolvePage(verifier, page.value)
```

`resolvePage` does everything that is *not* framework-shaped — fetching each node's publication,
checking the pin, and joining the page's keyed values to the component's positional parameters — and
returns a tree of `ResolvedNode`:

```ts
interface ResolvedNode {
  component: string       // what the page called it; for reporting
  name: string            // the published name — what your map is keyed by
  type: 'prebuilt' | 'dynamic'
  publication: ComponentPublication
  values: ResolvedValue[] // already in parameter order
  executable?: PublishedExecutable
}
```

`values` is **already ordered**, so a wrapper spreads it into a component and is done. Use
`isChildren(value)` to tell a slot of child nodes from an ordinary value.

Writing that wrapper for your framework is about thirty lines. `packages/sdk/WRAPPERS.md` documents
the five rules it must follow, and includes a prompt for an LLM to write it for you.

## Verifying without executing

```js
import { Verifier } from '@genoacms/sdk/verify'
```

The `/verify` entry point is the portable half: it fetches and verifies and touches no DOM, executes
nothing, and is what the conformance corpus is run against. A server-side consumer, or one that only
wants a verdict, imports this and ships no executor it cannot use.

## What a consumer does not have to trust

Nothing between you and the instance. Every signature is checked **in your process**, against the
root key you embedded — so a proxy, a CDN, or a mirror that lied about a document is refused exactly
as a lying bucket would be.

That is why the demo applications can serve published documents through an ordinary HTTP route
without that route being part of the trusted path: it parses nothing and checks no signature, and if
it substituted a document the browser would refuse it.

:::caution[Rollback protection lasts as long as your verifier does]
A signature says a document came from the instance, **not when**. An older key registry replays a
valid signature and undoes what a newer one recorded — a revocation, above all. A `Verifier` keeps
the highest registry sequence it has seen and refuses anything below it, so the protection holds
**within one instance of the class**. A fresh page load starts with no high-water mark. Persisting it
across loads is yours to add, and needs storage the SDK deliberately does not assume.
:::

## Next

- [Documents a consumer receives](/reference/sdk/documents/) — the exact shapes, field by field.
- [The attribute vocabulary](/reference/sdk/attributes/) — what a value can be.
- [What GenoaCMS stores](/guide/storage-layout/) — where these documents live in the bucket.
