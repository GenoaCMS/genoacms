import { isGuardExhausted } from '@genoacms/internal/guards'
import { facadeFor, inertDocumentFrom, hostDocument, unavailable, type DomFacade } from './dom.js'
import { loadModule, entryFunction, type ModuleLoader } from './module.js'
import { resolvePage, isChildren, missingComponents } from './resolve.js'
import type { ResolvedNode, ResolvedValue } from './resolve.js'
import type { Verifier } from '../verify/client.js'
import type { ReadablePageNode } from '../verify/pageTree.js'

/**
 * Rendering a resolved page into DOM.
 *
 * ## One of several renderers, and the one every consumer needs some of
 *
 * `resolvePage` does everything that is not framework-specific: verifying each node's publication,
 * checking it against the pin, and putting the page's values into the component's parameter order.
 * This file is what turns that into a document — and it is not the only thing that can. A React or
 * Vue wrapper consumes the same resolved tree and renders its own components instead.
 *
 * Every wrapper still needs **this**, though, for two reasons. A **dynamic** component is compiled to
 * a function that returns a DOM node and takes its slot as `Node[]`, so a wrapper meeting one hands
 * the whole subtree here and places what comes back. And a consumer with no framework at all has
 * nothing else.
 *
 * ## A rendered child is a `Node`
 *
 * A component is a function taking its values positionally and returning a DOM node; a slot arrives
 * as `readonly Node[]`, already rendered. That is deliberately the smallest thing every browser
 * framework can accept without the SDK adopting one.
 *
 * The SDK builds no nodes of its own. Components do, and this orchestrates them.
 *
 * ## What can fail here, and what cannot
 *
 * Only one kind of thing: **a verified artifact whose code will not run.** A bundle that throws while
 * evaluating, one with no default export, a component that raises, a component that returns something
 * that is not a node. All of them are an author's mistake rather than a fact about the documents, so
 * each fails **its own node only** — the node contributes nothing to its parent's slot and is
 * reported in `failures`. Nothing is invented in its place, because a stand-in would put content on
 * the page that no component produced.
 *
 * A component stopped by its own **runtime guard** is contained the same way and reported apart. The
 * two are different events: one is a bug, the other is a bound doing what it was compiled to do, and
 * a consumer deciding whether a page is worth showing wants to know which it met.
 *
 * Everything that fails the *page* was already decided by `resolvePage`, which is why that is a
 * separate call returning a separate answer. The one exception is a component this consumer has not
 * supplied — that is a fact about the consumer, not the documents, and it is checked up front so the
 * page is refused rather than rendered with a hole.
 *
 * The root is where the two rules meet: if the root's own code will not run there is no page, so it
 * is reported as a page-level failure carrying the reason the node gave.
 */

/** A component: given its attribute values in order, it returns a node. */
type ComponentFunction = (...args: never[]) => unknown

/**
 * The consumer's own components, by name.
 *
 * Keyed by the name in the **publication**, which is the one bound to the pin and therefore stable:
 * a publication is immutable, so the name it was released under never changes. A node's `component`
 * carries whatever the component was called when the *page* was built, and renaming a component
 * between publishing it and building a page makes the two differ legitimately.
 */
type PrebuiltComponents = Record<string, ComponentFunction>

interface RenderOptions {
  /** Prebuilt components this consumer supplies. See `PrebuiltComponents`. */
  components?: PrebuiltComponents
  /** How source text becomes a module. See `ModuleLoader`. */
  loader?: ModuleLoader
  /**
   * What this application makes available to every dynamic component it renders.
   *
   *     component(heading, cards, …attributes, passthrough)
   *                                            └── this object, by reference
   *
   * Components authored in the CMS cannot reach a global, import a package, or call the network —
   * so without a channel they can only rearrange the values they were given. This is that channel:
   * a date formatter, an icon set, a design-system helper, whatever this application chooses.
   *
   * **One object for the whole deployment**, not one per component. Components are authored in the
   * CMS *after* a consumer is built, so keying capabilities by component name would starve every
   * component written later, or force a redeploy to introduce one.
   *
   * **What goes in it is this application's security decision, and not GenoaCMS's.** The components
   * receiving it were compiled and signed by the CMS and this application has almost certainly never
   * read them, so anything placed here is granted to code nobody here reviewed. Passing `fetch` gives
   * every component the network. Nothing verifies or constrains the contents, deliberately: a check
   * performed here would be a guarantee that cannot be kept.
   *
   * It is never signed and never part of a document — it is an argument, supplied when a component
   * is called. Prebuilt components do not receive it: their code is this application's own and
   * already has whatever it needs.
   */
  passthrough?: Record<string, unknown>
  /**
   * The document dynamic components build their nodes from.
   *
   * Defaulted to the page's own. Supplied explicitly for server-side rendering, where there is none
   * — without it a component that builds DOM fails its own node and the page renders around it.
   *
   * It is never handed to a component. What a component receives is a facade bound to an inert
   * document created from this one, whose `defaultView` is null.
   */
  document?: Document
}

/** A node that was resolved and verified, and whose code still would not run. */
interface NodeFailure {
  /** The component the node named, so the report says which one. */
  component: string
  reason: string
}

/**
 * A rendered page, and everything that went wrong inside it that did not stop it.
 *
 * `failures` is empty on an ordinary render and is **not** an error channel — a page with one failing
 * component is still a page, and what that is worth is the consumer's to decide.
 */
type Rendered =
  | { ok: true, value: Node, failures: NodeFailure[] }
  | { ok: false, reason: string }

/** A single node's answer: rendered, or the reason its code would not run. */
type NodeRendered =
  | { ok: true, value: Node }
  | { ok: false, reason: string }

/** A component this renderer can call, or why it cannot be reached. */
type Callable =
  | { ok: true, value: ComponentFunction }
  | { ok: false, reason: string }

const contain = (reason: string): NodeRendered => ({ ok: false, reason })

/**
 * Whether a value is a DOM node, asked by shape rather than by `instanceof Node`.
 *
 * **Deliberate, and not laxity.** A consumer may execute components somewhere other than the
 * page's own realm — a worker, a sandboxed iframe — and a node built there is a perfectly good node
 * that `instanceof` answers `false` for, because the constructor it came from is a different object.
 * Refusing those would refuse exactly the placement the SDK was designed to allow.
 */
const isNode = (value: unknown): value is Node => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { nodeType?: unknown, nodeName?: unknown }
  return typeof candidate.nodeType === 'number' && typeof candidate.nodeName === 'string'
}

/**
 * The entry function of a published bundle.
 *
 * Evaluating a module and reaching its default export are both ways a **verified** artifact turns out
 * to be unrunnable, so both are contained to the node.
 */
const dynamicComponent = async (code: string, loader?: ModuleLoader): Promise<Callable> => {
  const loaded = await loadModule(code, loader)
  if (!loaded.ok) return { ok: false, reason: loaded.reason }

  const entry = entryFunction(loaded.value)
  if (!entry.ok) return { ok: false, reason: entry.reason }
  return { ok: true, value: entry.value }
}

/**
 * Why a component stopped.
 *
 * A guard trip is recognized by the error's shape rather than by `instanceof`: a consumer may run
 * components in a worker or a sandboxed iframe, where `Error` is a different constructor and the
 * check would answer `false` for a genuine trip.
 */
const reasonFor = (error: unknown): string =>
  isGuardExhausted(error)
    ? `guard-exhausted: ${error.guard} (limit ${error.limit})`
    : `component-threw: ${String(error)}`

/** Calls a component, containing whatever it does wrong to the node that named it. */
const invoke = (
  component: ComponentFunction,
  values: unknown[],
  node: ResolvedNode
): NodeRendered => {
  let result: unknown
  try {
    result = (component as (...args: unknown[]) => unknown)(...values)
  } catch (error) {
    return contain(reasonFor(error))
  }
  if (!isNode(result)) {
    return contain(`component-returned-not-a-node: '${node.component}' returned ${typeof result}`)
  }
  return { ok: true, value: result }
}

/**
 * Moves a finished tree out of the inert document and into the page's.
 *
 * Only when something was built there. A tree of prebuilt components already belongs to the page,
 * and adopting it would be a no-op with a spec lookup attached.
 */
const placed = (node: Node, host?: Document, inert?: Document): Node =>
  host !== undefined && inert !== undefined && node.ownerDocument === inert
    ? host.adoptNode(node)
    : node

/**
 * Renders an already-resolved tree into a document.
 *
 * Separate from `renderPage` because this is what a framework wrapper calls when it meets a dynamic
 * component: the subtree is already resolved, and what it needs is a node to place.
 *
 * `failures` is appended to rather than returned per node, so one traversal produces one report.
 */
const renderResolved = async (
  root: ResolvedNode,
  options: RenderOptions = {}
): Promise<Rendered> => {
  const components = options.components ?? {}
  // Defaulted once, so every dynamic component receives the same object rather than a fresh empty
  // one per call — a component that writes to it can be read by the next, which is the consumer's
  // to allow or prevent, and would be silently impossible if this were built per invocation.
  const passthrough = options.passthrough ?? {}
  const host = hostDocument(options.document)
  /**
   * One inert document per render, built on first use.
   *
   * Per render rather than per component, so a parent can append a child another component built
   * without either being adopted first. Lazily, so a page of prebuilt components creates nothing.
   */
  let inert: Document | undefined
  let dom: DomFacade | undefined
  const facade = (): DomFacade => {
    if (dom !== undefined) return dom
    if (host === undefined) return (dom = unavailable())
    inert = inertDocumentFrom(host)
    return (dom = facadeFor(inert))
  }
  const failures: NodeFailure[] = []
  /** One module per publication, however many nodes run it. Twenty placements is one evaluation. */
  const modules = new Map<string, Callable>()

  const componentFor = async (node: ResolvedNode): Promise<Callable> => {
    if (node.executable === undefined) {
      const supplied = components[node.name]
      // Reached only when a component vanished between the check up front and here, which cannot
      // happen for one render — kept because the alternative is calling `undefined`.
      if (typeof supplied !== 'function') {
        return { ok: false, reason: `component-not-supplied: '${node.name}'` }
      }
      return { ok: true, value: supplied }
    }

    const key = `${node.publication.uid}/${node.publication.publicationId}`
    const remembered = modules.get(key)
    if (remembered !== undefined) return remembered

    const loaded = await dynamicComponent(node.executable.executableCode, options.loader)
    modules.set(key, loaded)
    return loaded
  }

  /** A slot's children, in order, with any whose code would not run left out. */
  const renderChildren = async (children: readonly ResolvedNode[]): Promise<Node[]> => {
    const rendered: Node[] = []
    for (const child of children) {
      const node = await renderNode(child)
      if (node.ok) rendered.push(node.value)
    }
    return rendered
  }

  const valuesFor = async (node: ResolvedNode): Promise<unknown[]> => {
    const values: unknown[] = []
    for (const value of node.values) {
      values.push(isChildren(value) ? await renderChildren(value) : value)
    }
    return values
  }

  /**
   * One node, with its children rendered first.
   *
   * Depth first, because a component is handed its slot already rendered — a parent cannot be called
   * until every child beneath it has been.
   */
  const renderNode = async (node: ResolvedNode): Promise<NodeRendered> => {
    const component = await componentFor(node)
    if (!component.ok) {
      failures.push({ component: node.component, reason: component.reason })
      return component
    }

    // Appended, never inserted: the attributes ahead of it are addressed by position, and the
    // reserved two follow in the order the compiler emitted them. Only a dynamic component gets
    // them — a prebuilt one is this application's own code.
    const values = await valuesFor(node)
    const rendered = invoke(
      component.value,
      node.executable === undefined ? values : [...values, facade(), passthrough],
      node
    )
    if (!rendered.ok) failures.push({ component: node.component, reason: rendered.reason })
    return rendered
  }

  /*
   * **Both checks are up front, and both fail the page.**
   *
   * A component this consumer has not supplied, or has supplied as something that cannot be called,
   * is a fact about *this application* rather than about the documents — and every other node of that
   * component would fail identically. Discovering it per node would contain it, and containment is
   * for an author's bug inside a verified artifact; this is a page the consumer cannot render.
   *
   * The two are reported apart because they are different mistakes: one is a component nobody wrote,
   * the other is a name bound to the wrong thing.
   */
  const callable = Object.keys(components).filter(name => typeof components[name] === 'function')
  const missing = missingComponents(root, callable)
  const uncallable = missing.filter(name => name in components)
  const absent = missing.filter(name => !(name in components))

  if (uncallable.length > 0) {
    const described = uncallable.map(name => `'${name}' is ${typeof components[name]}`).join(', ')
    return { ok: false, reason: `component-not-a-function: ${described}` }
  }
  if (absent.length > 0) {
    return {
      ok: false,
      reason:
        `component-not-supplied: this page uses ${absent.map(name => `'${name}'`).join(', ')}, ` +
        'which this consumer did not supply'
    }
  }

  const rendered = await renderNode(root)
  // Where the two rules meet: a component that will not run fails only its own node, and when that
  // node is the root there is no page left to return.
  if (!rendered.ok) return { ok: false, reason: rendered.reason }
  return { ok: true, value: placed(rendered.value, host, inert), failures }
}

/**
 * A verified page tree, resolved and rendered into a node.
 *
 * The two steps in one call, for a consumer that wants DOM and nothing else. A consumer rendering
 * with a framework calls `resolvePage` and comes back here only for dynamic subtrees.
 */
const renderPage = async (
  verifier: Verifier,
  tree: ReadablePageNode,
  options: RenderOptions = {}
): Promise<Rendered> => {
  const resolved = await resolvePage(verifier, tree)
  if (!resolved.ok) return { ok: false, reason: resolved.reason }
  return await renderResolved(resolved.value, options)
}

export { renderPage, renderResolved, isNode }
export type {
  Rendered, RenderOptions, PrebuiltComponents, ComponentFunction, NodeFailure, ResolvedValue
}
