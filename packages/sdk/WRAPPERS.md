# Writing a framework wrapper

`@genoacms/sdk` is headless. It fetches a published page, verifies every signature, checks every pin
and works out which value goes to which of a component's parameters — and then stops, because
everything after that is framework-shaped.

A **wrapper** is the piece that turns the SDK's answer into your framework's components. It is
usually 40–60 lines. This document is how to write one, and there is a prompt at the end you can hand
to an LLM to write it for you.

Four are maintained in this repository as worked examples — `packages/demo-svelte` (SvelteKit),
`demo-react`, `demo-vue` and `demo-vanilla`. They render the same page, from the same SDK, and
differ **only** in the wrapper and in how each serves the instance's documents to the browser.

## What the SDK gives you

```ts
import { Verifier, httpSource, resolvePage } from '@genoacms/sdk'

const verifier = new Verifier({ rootPublicKey, source: httpSource(origin) })

const page = await verifier.pageTree('home')     // verified, or refused
if (page === undefined || !page.valid) { /* nothing safe to render */ }

const resolved = await resolvePage(verifier, page.value)
```

`resolvePage` returns a tree of `ResolvedNode`:

```ts
interface ResolvedNode {
  name: string              // the published name — what your component map is keyed by
  component: string         // what the *page* called it; for reporting only
  type: 'prebuilt' | 'dynamic'
  publication: ComponentPublication
  values: ResolvedValue[]   // already in the component's parameter order
  executable?: PublishedExecutable   // present exactly for a dynamic component
}
```

**`values` is the important part.** It is already in the order the publication signed, so a wrapper
never reads `attributeOrder` and never sees the page's own keys. A slot appears in `values` as an
array of child `ResolvedNode`s — use `isChildren(value)` to tell one from a list of URLs.

## The five rules

**1. Key your components by `node.name`, not `node.component`.** A publication is immutable, so the
name it was released under never changes. A page carries whatever the component was called when the
page was built, and renaming a component in the CMS makes the two differ legitimately.

**2. Map positional values to named props explicitly.** GenoaCMS attributes are positional; almost
every framework's components take named props. Write the mapping down:

```ts
const bindings = {
  Hero: { component: Hero, props: ['heading', 'body'] },
  Card: { component: Card, props: ['title', 'text'] }
}
```

The `props` list must match the publication's `attributeOrder`. Nothing enforces that — the signed
order decides which value is which, and getting your list out of step puts the right values in the
wrong props **with every signature still valid**.

**3. Recurse into slots first.** A parent is rendered with its children already built.

**4. A missing component must fail the page, not the node.** A page naming a component you have not
supplied is a page you cannot render; dropping the section serves a page quietly missing part of
itself. `missingComponents(tree, Object.keys(bindings))` gives you the list up front.

**5. Hand a dynamic component to the SDK.** A component authored in the CMS is compiled to a
function that returns a **DOM node** and takes its slot as `Node[]`. It cannot take React children or
Vue vnodes and cannot be one. When `node.executable` is present, call `renderResolved(node)` on that
whole subtree and place the node it returns:

```tsx
const host = useRef(null)
useEffect(() => {
  renderResolved(node).then(r => { if (r.ok) host.current.replaceChildren(r.value) })
}, [node])
return <div ref={host} />
```

Place the node — never serialize it to markup. `innerHTML` or `{@html}` would discard every event
handler the component attached.

**Thread the render options through.** `renderResolved(node)` with no options gives a dynamic
component an empty `passthrough`, the page's own document, and the environment's `fetch`. That is a
reasonable default and it is not yours to fix silently: `passthrough` is the consuming application's
security decision — the one channel by which a component reaches anything the application owns — so a
wrapper that swallows it takes that decision away from the person using the wrapper. Accept the same
options a consumer would pass to `renderPage`, and hand them on:

```tsx
renderResolved(node, { components, passthrough, document, fetch })
```

The consumer guide (`/guide/consumer/`, in `packages/docs`) documents what each one grants. A wrapper
should repeat the caution rather than the detail: **whatever the application puts in `passthrough` is
granted to code nobody on the consumer's side reviewed**, and passing `fetch` there gives every
component the network.

Nothing else about a dynamic component is a wrapper's concern. The `bridge` it uses and the `dom`
facade it builds from are constructed inside the signed artifact and by the SDK respectively; there
is no option that widens either, and a wrapper cannot supply them.

## What each framework needs

| | how a slot is passed |
| :--- | :--- |
| **React** | Map children to elements and pass them as a prop. `ReactNode` is a value, so this is direct. |
| **Vue** | Map children to vnodes with `h()` and pass them as a prop — not through `v-slot`, which adds a naming convention neither the CMS nor the SDK has. |
| **Svelte** | Pass the children as **data** and give consumers one `<GenoaChildren nodes={…} />` component. Svelte has no value meaning "already-rendered content"; a snippet cannot be constructed and handed over as a prop, and trying renders nothing at all, silently. Avoid naming a local `props` — it collides with the `$props` rune in the generated code, and the error blames the rune. |
| **none** | Nothing to write — `renderResolved` already returns a DOM node. |

Put your bindings in **context** (Svelte, Vue) or a provider (React) so a consumer's components
receive only their values, never the wrapper's machinery.

## A prompt for an LLM

Copy this, fill in the framework, and paste it along with your component list.

> I am writing a rendering wrapper for `@genoacms/sdk`, a headless CMS client SDK, in
> **&lt;FRAMEWORK&gt;**.
>
> The SDK exposes `resolvePage(verifier, tree)`, which returns a tree of `ResolvedNode`:
>
> ```ts
> interface ResolvedNode {
>   name: string            // the published component name
>   component: string       // what the page called it; reporting only
>   type: 'prebuilt' | 'dynamic'
>   values: ResolvedValue[] // already in the component's parameter order
>   executable?: { platform: string, executableCode: string, compiledAt: number }
> }
> type ResolvedValue = boolean | number | string | readonly string[] | readonly ResolvedNode[]
> ```
>
> It also exposes `isChildren(value)` — true when a value is a slot rather than a list of URLs —
> `missingComponents(tree, suppliedNames)`, and `renderResolved(node, { components })`, which renders
> a subtree to a DOM `Node`.
>
> Write a wrapper component that renders a `ResolvedNode` tree using **&lt;FRAMEWORK&gt;**
> components, following these rules exactly:
>
> 1. Resolve each node's component from a map keyed by `node.name` (**not** `node.component`).
> 2. The map holds, per component, the framework component and an ordered list of prop names. Map
>    `values[i]` to `props[i]`. Do not derive prop names from anything else.
> 3. For a value where `isChildren(value)` is true, recurse into each child first and pass the
>    results as that prop.
> 4. If `node.name` is not in the map, **fail the whole render** with a clear error. Do not skip the
>    node and do not render a placeholder.
> 5. If `node.executable` is present, do not try to render it as a framework component. Call
>    `renderResolved(node, options)`, await it, and place the returned DOM node into a host element
>    using the framework's ref/action mechanism. Never use `innerHTML` or an equivalent. `options`
>    are the render options the application gave the wrapper — `components`, `passthrough`,
>    `document`, `fetch` — passed through unchanged rather than defaulted by the wrapper.
> 6. Pass the component map through context/provider rather than threading it through every
>    component's props.
>
> My components are: &lt;LIST EACH COMPONENT, ITS PUBLISHED NAME, AND ITS PROPS IN ORDER&gt;
>
> Write idiomatic **&lt;FRAMEWORK&gt;**. Explain any place where the framework cannot express one of
> these rules directly.

## A note on SvelteKit, and on server rendering generally

The Svelte demo is a **SvelteKit** application, and it deliberately does *not* fetch the page in
`load`. SvelteKit would happily verify on the server and send the result down — and that is precisely
what must not happen. The claim the SDK makes is that a consumer verifies **for itself**; a page that
arrived already verified has had that done on its behalf by something the browser cannot check.

Components also build DOM nodes, so rendering needs a document. Both reasons point the same way:
fetch, verify and render in the browser.

Server-side verification is still legitimate — the SDK's `./verify` entry point has no DOM and exists
for it — but then the *server* is the consumer, and whatever it sends onward is trusted by whoever
receives it. That is a different architecture, not the same one done earlier.

## Publishing a wrapper

If you write one for a framework not listed here, it is an ordinary package that depends on
`@genoacms/sdk` — there is nothing to register and no plugin interface. This repository does not
intend to maintain ports; the four demos exist to show the shape, not to be the only ones.
