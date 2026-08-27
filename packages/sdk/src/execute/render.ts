import { loadModule, entryFunction, type ModuleLoader } from './module.js'
import { attributeNames } from '../verify/publication.js'
import type { Verifier } from '../verify/client.js'
import type { ComponentPublication, PublishedExecutable } from '../verify/publication.js'
import type { ReadablePageNode, ReadableAttributeValue } from '../verify/pageTree.js'

/**
 * Turning a verified page tree into DOM.
 *
 * ## A rendered child is a `Node`
 *
 * A component is a function that returns a DOM node, and a slot arrives as its children **already
 * rendered** — `readonly Node[]`, in the order the page holds them. That is the whole contract, and
 * it is deliberately the smallest thing every browser framework can accept: a Svelte, React or
 * vanilla consumer can all place a node, and none of them has to be the one this SDK chose.
 *
 * The SDK builds no nodes of its own. Components do, and this orchestrates them — which is also why
 * nothing here needs a `document`.
 *
 * ## Two ways a node fails, and two answers
 *
 * The distinction is **not** how severe the fault is. It is whether the fault says something about
 * the documents or about the code inside one, and the two are told apart in the type below rather
 * than by where they happen to be caught.
 *
 * **A node that cannot be resolved fails the whole page.** Its publication is absent, or does not
 * verify, or is not the one the page pinned, or is a kind the page did not expect, or names a
 * prebuilt component this consumer does not have. Every one of those is either tampering or a
 * consumer that is not configured for this page, and the plausible tampering leaves a document that
 * looks entirely ordinary. There is no safe degraded shape to fall back to: rendering the rest would
 * be rendering whatever was written to the bucket, minus the part that gave it away.
 *
 * **A node whose code will not run fails only itself.** A bundle that throws while evaluating, one
 * with no default export, a component that raises, a component that returns something that is not a
 * node — all of them are verified artifacts that are simply wrong, and one author's mistake is a fact
 * about that component rather than grounds for failing a request. Such a node contributes nothing to
 * its parent's slot and is reported in `failures`. Nothing is invented in its place: a renderer that
 * substituted content would be putting something on the page that no component produced.
 *
 * The root is the one node where the two meet. If the root's own code will not run there is no page,
 * so it is returned as a page-level failure carrying the reason the node gave.
 *
 * ## Each publication is fetched, verified and evaluated once
 *
 * A page that places one card twenty times pins one publication twenty times. Verifying it twenty
 * times would be twenty signature checks for one answer, and evaluating its bundle twenty times would
 * produce twenty modules with twenty copies of whatever module state the author wrote. The cache
 * lives for one render and is not shared between them, so nothing is remembered across a page.
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
  /** How source text becomes a module. See `ModuleLoader` — the seam D10 needs. */
  loader?: ModuleLoader
}

/** A node that was resolved and verified, and whose code still would not run. */
interface NodeFailure {
  /** The component the node named, so the report says which one. */
  component: string
  reason: string
}

/**
 * A step's answer, carrying **which kind of failure it is** rather than leaving that to the caller.
 *
 * The alternative was to classify at the call site by reading the reason, which puts the rule in
 * every place that handles one instead of in the place that discovers it — and gets it silently wrong
 * the first time a new reason is added.
 */
type Step<T> =
  | { ok: true, value: T }
  /** The documents cannot be trusted or resolved. Fails the page. */
  | { ok: false, fatal: true, reason: string }
  /** A verified artifact will not run. Fails only its own node. */
  | { ok: false, fatal: false, reason: string }

/**
 * A rendered page, and everything that went wrong inside it that did not stop it.
 *
 * `failures` is empty on an ordinary render and is **not** an error channel — a page with one failing
 * component is still a page, and what that is worth is the consumer's to decide.
 */
type Rendered =
  | { ok: true, value: Node, failures: NodeFailure[] }
  | { ok: false, reason: string }

/** Something is wrong with the documents. */
const refuse = (reason: string): Step<never> => ({ ok: false, fatal: true, reason })

/** Something is wrong with the code inside them. */
const contain = (reason: string): Step<never> => ({ ok: false, fatal: false, reason })

/**
 * Whether a value is a DOM node, asked by shape rather than by `instanceof Node`.
 *
 * **Deliberate, and not laxity.** D10 lets a consumer execute components somewhere other than the
 * page's own realm — a worker, a sandboxed iframe — and a node built there is a perfectly good node
 * that `instanceof` answers `false` for, because the constructor it came from is a different object.
 * Refusing those would refuse exactly the placement the SDK was designed to allow.
 */
const isNode = (value: unknown): value is Node => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { nodeType?: unknown, nodeName?: unknown }
  return typeof candidate.nodeType === 'number' && typeof candidate.nodeName === 'string'
}

/** Whether an attribute value is a slot rather than a list of resolved URLs. */
const isSlot = (value: ReadableAttributeValue): value is ReadablePageNode[] =>
  Array.isArray(value) && !value.every(member => typeof member === 'string')

/**
 * The component a node names, fetched and verified.
 *
 * A node carrying no pin was never published — there is nothing to fetch and nothing to verify, so
 * there is no basis on which to run anything for it.
 */
const publicationFor = async (
  verifier: Verifier,
  node: ReadablePageNode
): Promise<Step<{ publication: ComponentPublication, executable?: PublishedExecutable }>> => {
  if (node.uid === undefined || node.publicationId === undefined) {
    return refuse(`node-unpublished: '${node.component}' was never published, so nothing can be run for it`)
  }

  const verdict = await verifier.component({
    uid: node.uid, publicationId: node.publicationId, type: node.type
  })
  if (verdict === undefined) {
    return refuse(`node-publication-absent: nothing is published at ${node.uid}/${node.publicationId}`)
  }
  if (!verdict.valid) return refuse(verdict.reason)

  return { ok: true, value: verdict.value }
}

/**
 * The consumer's component of that name.
 *
 * A missing one fails the **page**, because it is not a fault in the page at all — it is a consumer
 * that has not been given the components the page is built from, and every other node of that
 * component would fail identically.
 */
const prebuiltComponent = (
  publication: ComponentPublication,
  components: PrebuiltComponents
): Step<ComponentFunction> => {
  const component = components[publication.name]
  if (component === undefined) {
    return refuse(
      `component-not-supplied: this page uses the prebuilt component '${publication.name}', ` +
      'which is not in the map this consumer supplied'
    )
  }
  if (typeof component !== 'function') {
    return refuse(`component-not-a-function: '${publication.name}' is ${typeof component}`)
  }
  return { ok: true, value: component }
}

/**
 * The entry function of a published bundle.
 *
 * Evaluating a module and reaching its default export are both ways a **verified** artifact turns out
 * to be unrunnable, so both are contained to the node.
 */
const dynamicComponent = async (
  executable: PublishedExecutable,
  loader?: ModuleLoader
): Promise<Step<ComponentFunction>> => {
  const loaded = await loadModule(executable.executableCode, loader)
  if (!loaded.ok) return contain(loaded.reason)

  const entry = entryFunction(loaded.value)
  if (!entry.ok) return contain(entry.reason)
  return { ok: true, value: entry.value }
}

/** Calls a component, containing whatever it does wrong to the node that named it. */
const invoke = (
  component: ComponentFunction,
  values: unknown[],
  node: ReadablePageNode
): Step<Node> => {
  let result: unknown
  try {
    result = (component as (...args: unknown[]) => unknown)(...values)
  } catch (error) {
    return contain(`component-threw: ${String(error)}`)
  }
  if (!isNode(result)) {
    return contain(`component-returned-not-a-node: '${node.component}' returned ${typeof result}`)
  }
  return { ok: true, value: result }
}

/** A publication and the callable it resolved to, remembered for one render. */
interface ResolvedComponent {
  publication: ComponentPublication
  component: ComponentFunction
}

/**
 * A page tree rendered into a node.
 *
 * The tree must already be **verified** — `Verifier.pageTree` returns one, and refuses an
 * unverifiable page rather than degrading to it. Nothing here re-opens that question; what it does is
 * resolve each node's component, which is a separate signature over a separate document.
 */
const renderPage = async (
  verifier: Verifier,
  tree: ReadablePageNode,
  options: RenderOptions = {}
): Promise<Rendered> => {
  const components = options.components ?? {}
  const cache = new Map<string, Step<ResolvedComponent>>()
  const failures: NodeFailure[] = []

  const resolve = async (node: ReadablePageNode): Promise<Step<ResolvedComponent>> => {
    const published = await publicationFor(verifier, node)
    if (!published.ok) return published

    const { publication, executable } = published.value
    // A prebuilt publication carries no bundle and a dynamic one carries the bundle this runtime
    // selected. Either kind contradicting itself was refused by the reader long before here.
    const component = executable === undefined
      ? prebuiltComponent(publication, components)
      : await dynamicComponent(executable, options.loader)

    if (!component.ok) return component
    return { ok: true, value: { publication, component: component.value } }
  }

  /** Resolved once per publication, however many nodes pin it. */
  const resolved = async (node: ReadablePageNode): Promise<Step<ResolvedComponent>> => {
    const key = `${node.uid ?? ''}/${node.publicationId ?? ''}`
    const remembered = cache.get(key)
    if (remembered !== undefined) return remembered

    const answer = await resolve(node)
    cache.set(key, answer)
    return answer
  }

  /**
   * The values a node's component is called with, in its parameter order.
   *
   * The order names attribute *references* and the page keys its values by attribute *name*, so the
   * two are joined through the publication — see `attributeNames`. A name the page holds no value for
   * is refused rather than passed as nothing: the page and the publication it pinned were written
   * from one description, so a gap means one of the two has changed since.
   */
  const argumentsFor = async (
    publication: ComponentPublication,
    node: ReadablePageNode
  ): Promise<Step<unknown[]>> => {
    const names = attributeNames(publication)
    if (!names.ok) return refuse(names.reason)

    const values: unknown[] = []
    for (const name of names.value) {
      if (!(name in node.data)) {
        return refuse(
          `node-missing-attribute: '${node.component}' takes "${name}", which this page holds no ` +
          'value for'
        )
      }
      const value = node.data[name]
      if (!isSlot(value)) {
        values.push(value)
        continue
      }
      const children = await renderChildren(value)
      if (!children.ok) return children
      values.push(children.value)
    }
    return { ok: true, value: values }
  }

  /**
   * A slot's children, in order.
   *
   * A child whose code would not run is left out — it is already in `failures`, and inventing a
   * stand-in would put something on the page no component produced. A child that could not be
   * *resolved* propagates, because that is the whole page's answer and not this slot's.
   */
  const renderChildren = async (children: ReadablePageNode[]): Promise<Step<Node[]>> => {
    const rendered: Node[] = []
    for (const child of children) {
      const node = await renderNode(child)
      if (node.ok) {
        rendered.push(node.value)
        continue
      }
      if (node.fatal) return node
    }
    return { ok: true, value: rendered }
  }

  /**
   * One node, with its children rendered first.
   *
   * Depth first, because a component is handed its slot already rendered — a parent cannot be called
   * until every child beneath it has been.
   */
  const renderNode = async (node: ReadablePageNode): Promise<Step<Node>> => {
    const component = await resolved(node)
    if (!component.ok) {
      if (!component.fatal) failures.push({ component: node.component, reason: component.reason })
      return component
    }

    const values = await argumentsFor(component.value.publication, node)
    if (!values.ok) return values

    const rendered = invoke(component.value.component, values.value, node)
    if (!rendered.ok) failures.push({ component: node.component, reason: rendered.reason })
    return rendered
  }

  const root = await renderNode(tree)
  // Where the two rules meet: a component that will not run fails only its own node, and when that
  // node is the root there is no page left to return.
  if (!root.ok) return { ok: false, reason: root.reason }
  return { ok: true, value: root.value, failures }
}

export { renderPage, isNode }
export type { Rendered, RenderOptions, PrebuiltComponents, ComponentFunction, NodeFailure }
