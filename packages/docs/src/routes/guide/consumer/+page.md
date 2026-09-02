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

## Running dynamic components

**Dynamic** components are the other kind: their code was authored in the CMS, compiled, signed, and
executed by the SDK in your process. You supply no code for them — but you do decide what they can
reach, and that decision is yours rather than the CMS's.

A dynamic component is handed four things, in this order, after its own attributes:

```js
component(...attributes, net, bridge, dom, passthrough)
```

You never build the middle two. `bridge` is constructed **inside the signed artifact** and refuses
any origin the instance did not compile into it; `dom` is a facade over a document that is not your
page. What you choose is `passthrough`, and optionally what `bridge` and `dom` are built from:

```js
await renderPage(verifier, page.value, {
  document,                                   // defaults to the page's own
  fetch: myClient,                            // what the bridge actually calls
  passthrough: { formatDate, icons }          // your capabilities — see below
})
```

### `passthrough` is your security decision, not GenoaCMS's

Component code cannot reach a global, import a package, or call the network. Without a channel it can
only rearrange the values it was given, so `passthrough` is that channel: a date formatter, an icon
set, a design-system helper — whatever your application chooses to grant.

:::caution[Nothing verifies what you put in it, deliberately]
The components receiving it were compiled and signed by the CMS, and your application has almost
certainly never read them. Anything you place here is granted to code nobody on your side reviewed.
Passing `fetch` gives every component the network, and passing `document` gives it your page. A check
performed by the SDK here would be a guarantee it cannot keep.
:::

It is **one object for the whole deployment**, passed by reference to every dynamic component on the
page. Components are authored in the CMS after your application ships, so keying capabilities by
component name would starve every component written later. A consequence worth knowing: a component
that writes to it can be read by the next one rendered. That is yours to allow or prevent — freeze
it, or hand each render a fresh copy, if you would rather it were not so.

Prebuilt components never receive it. Their code is already yours.

### What `fetch` and `document` change, and what they do not

`fetch` is the **raw capability the bridge calls**, not the bridge. Supplying it routes a component's
requests through your own client — headers, retries, a proxy — and does not widen what a component
may ask for: the origin check is code the CMS compiled into the artifact. Where there is no `fetch`
at all, a component that never asks for the network is unaffected and one that does fails its own
node.

`document` is what the SDK builds an **inert** document from — never the document a component
receives. Supply it for server-side rendering, where there is no page. Without one, a component that
builds DOM fails its own node and the rest of the page renders.

### Ceilings, and what a trip looks like

Every dynamic artifact is compiled with three bounds signed into it: **fuel** (loop iterations and
function calls), **depth** (nested calls), and **allocation** (cumulative sized allocations and
string growth). They are the instance's numbers, chosen by an administrator and covered by the
artifact's signature.

**You cannot set them, raise them, or lower them.** There is no runtime channel by which a budget
reaches a component, so there is nothing to configure and nothing for the SDK to refuse. A component
you find too expensive is a conversation with whoever administers the instance; components published
after they change a ceiling are compiled against the new one.

Exceeding a budget throws inside the component and **fails that node alone**:

```js
const rendered = await renderPage(verifier, page.value, { components: mine })

rendered.ok         // true — the page rendered
rendered.failures   // [{ component: 'Hero', reason: 'guard-exhausted: fuel (limit 1000000)' }]
```

The node contributes nothing to its parent's slot and nothing is put in its place — a stand-in would
be content no component produced. Read `failures` if you want to log or report them; ignoring it
renders a page with a hole where the component was, which is the intended behavior. A trip is
deliberately distinguishable from an ordinary fault (`component-threw: …`): one is a bound doing its
job, the other is a bug.

The one exception is a trip in the page's **root**, which leaves no page to return and is reported as
`rendered.ok === false` carrying the guard that stopped it.

### What this does not protect you from

The bounds above are about **resource exhaustion**, and the analysis that runs at commit time is a
denylist of dangerous names. A denylist sees the names an author *writes*. An author who assembles a
banned name at run time — building the string `"constructor"` from two halves, for instance — is
outside what it can see, and the runtime guards do not carry that case: they bound what a component
spends, and a few property reads spend nothing.

So the accurate statement is that GenoaCMS makes a component's *cost* bounded and its *reach* narrow
by default, against an author who is careless or whose account was taken for casual mischief. It is
not a sandbox, and it does not claim to stop a determined author who is deliberately attacking the
consumers of the instance that publishes them. Who may commit code is an authorization question, and
the answer to it is in [authorization](/guide/authorization/); every publication is attributed and
signed, so a component that did something is traceable to who released it.

:::caution[Treat a dynamic component as code you are running]
Because that is what it is. If your application handles data a component must never see, keep it out
of the component's attributes and out of `passthrough` — that boundary is the one you control.
:::

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
