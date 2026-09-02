import { attributeNames } from '../verify/publication.js'
import type { Verifier } from '../verify/client.js'
import type {
  ComponentPublication, ComponentType, PublishedExecutable
} from '../verify/publication.js'
import type { ReadablePageNode, ReadableAttributeValue } from '../verify/pageTree.js'

/**
 * A verified page, prepared for rendering — by anything.
 *
 * ## What this is for
 *
 * Rendering is framework-specific and verification is not. Everything between them is *also* not:
 * fetching each node's publication, checking it against the pin, joining the page's keyed values to
 * the component's positional parameters, and doing the same for every child. That work is identical
 * whether the answer ends up as DOM, as React elements, as Vue vnodes, or as anything else — and
 * until this file existed it was welded to the DOM renderer, so a consumer wanting framework
 * components of its own had to either reimplement it or give up on them.
 *
 * **Nothing here touches a document.** No node is created, no module is evaluated, and no component
 * is called. What comes out is a description: which component each node is, and what to call it with.
 *
 * ## The two halves of a wrapper, and why a dynamic component is different
 *
 * A **prebuilt** component's code is the consuming application's, so a framework wrapper renders it
 * with its own component of that name — a React component, a Svelte one — and that is the whole point
 * of resolving without rendering.
 *
 * A **dynamic** component's code was authored in the CMS and compiled for the web. It is a function
 * that returns a DOM node and takes its slot as `Node[]`, so it cannot be handed React children and
 * cannot itself be a React element. A wrapper meeting one hands that **whole subtree** to the DOM
 * renderer and places the node it gets back. That is not a limitation of this design; it is what
 * compiling a component to `web-esmodule` means, and every wrapper does the same thing with it.
 *
 * ## Failures here are the page's
 *
 * Everything this file can discover is a fact about the *documents*: a publication that is absent,
 * does not verify, is not the one the page pinned, or describes parameters the page holds no value
 * for. Each of those is either tampering or two signed documents disagreeing, and the plausible
 * tampering leaves something that looks entirely ordinary — so there is nothing safe to degrade to
 * and resolution fails whole.
 *
 * The other kind of failure — a verified artifact whose *code* will not run — cannot happen here,
 * because nothing here runs anything. It belongs to whoever renders, which is what makes the split
 * between this file and `render.ts` the same split as the one between the two failure rules.
 */

/** The values a resolved node carries, in the order its component's parameters take them. */
type ResolvedValue =
  | boolean
  | number
  | string
  | readonly string[]
  | readonly ResolvedNode[]

/**
 * One node, verified and ready to be rendered by anything.
 *
 * `values` is already in parameter order, so a renderer never consults `attributeOrder` itself and
 * never sees the page's keys. That is deliberate: the join between the two is the step most likely to
 * be got wrong, it is invisible when it is wrong, and it should be done once here rather than once
 * per framework.
 */
interface ResolvedNode {
  /**
   * What the **page** called this component.
   *
   * For reporting, and not for resolving anything: it carries whatever the component was named when
   * the page was built. Use `name` to look a component up.
   */
  component: string
  /**
   * The name the **publication** carries — what a consumer's component map is keyed by.
   *
   * A publication is immutable, so the name it was released under never changes. The page's name
   * does, whenever somebody renames the component, and the two then differ legitimately.
   */
  name: string
  type: ComponentType
  publication: ComponentPublication
  values: ResolvedValue[]
  /**
   * The bundle this runtime will run.
   *
   * Present exactly when the component is dynamic. A wrapper that meets one renders that subtree
   * through the DOM renderer — see the note above.
   */
  executable?: PublishedExecutable
}

type Resolved =
  | { ok: true, value: ResolvedNode }
  | { ok: false, reason: string }

/** A verified publication and the bundle this runtime selected, or why neither is available. */
type Publication =
  | { ok: true, value: { publication: ComponentPublication, executable?: PublishedExecutable } }
  | { ok: false, reason: string }

const refuse = (reason: string): Resolved => ({ ok: false, reason })

/** Whether a resolved value is a slot — children — rather than text or a list of URLs. */
const isChildren = (value: ResolvedValue): value is readonly ResolvedNode[] =>
  Array.isArray(value) && value.every(member => typeof member === 'object' && member !== null)

/** Whether a page's attribute value is a slot rather than a list of resolved URLs. */
const isSlot = (value: ReadableAttributeValue): value is ReadablePageNode[] =>
  Array.isArray(value) && !value.every(member => typeof member === 'string')

/** Every published name a resolved tree asks for, each once, in the order first met. */
const componentsUsed = (root: ResolvedNode): string[] => {
  const names: string[] = []
  const walk = (node: ResolvedNode): void => {
    if (!names.includes(node.name)) names.push(node.name)
    for (const value of node.values) {
      if (isChildren(value)) for (const child of value) walk(child)
    }
  }
  walk(root)
  return names
}

/**
 * The names a tree needs that a consumer has not supplied.
 *
 * **Here rather than in each wrapper**, because the rule that goes with it is easy to get wrong in a
 * way nothing reveals: a page naming a component the consumer does not have must be **refused**, not
 * rendered with a gap. A missing component is not a fault in the page — it is an application that has
 * not been given the components the page is built from, and dropping the section would serve a page
 * quietly missing part of itself.
 *
 * Dynamic components are skipped: their code came from the CMS, so a consumer is not expected to
 * supply anything for them.
 */
const missingComponents = (root: ResolvedNode, supplied: Iterable<string>): string[] => {
  const available = new Set(supplied)
  const wanted = componentsUsed(root)
  const dynamic = new Set<string>()
  const walk = (node: ResolvedNode): void => {
    if (node.type === 'dynamic') dynamic.add(node.name)
    for (const value of node.values) {
      if (isChildren(value)) for (const child of value) walk(child)
    }
  }
  walk(root)
  return wanted.filter(name => !dynamic.has(name) && !available.has(name))
}

/**
 * Verifies every node of a page and puts its values in parameter order.
 *
 * The tree must already be verified — `Verifier.pageTree` returns one, and refuses an unverifiable
 * page rather than degrading to it. What this adds is the *second* signature on every node: the
 * publication it pinned, which is a separate document signed at a separate time.
 *
 * Each publication is fetched and verified **once**, however many nodes pin it. A page placing one
 * card twenty times is one signature check, not twenty.
 */
const resolvePage = async (verifier: Verifier, tree: ReadablePageNode): Promise<Resolved> => {
  /**
   * The verified publication for each pin, fetched once.
   *
   * The **publication** is cached and the resolved node is not, and the difference matters: two
   * nodes of one component share a publication and carry different values, so caching the node would
   * render the second with the first's content. A failure is cached too — the same broken
   * publication pinned twenty times is one answer, not twenty round trips to reach it.
   */
  const cache = new Map<string, Publication>()

  const publicationFor = async (node: ReadablePageNode): Promise<Publication> => {
    if (node.uid === undefined || node.publicationId === undefined) {
      return {
        ok: false,
        reason: `node-unpublished: '${node.component}' was never published, so nothing can be run for it`
      }
    }

    const key = `${node.uid}/${node.publicationId}`
    const remembered = cache.get(key)
    if (remembered !== undefined) return remembered

    const answer = await fetchPublication(node, node.uid, node.publicationId)
    cache.set(key, answer)
    return answer
  }

  const fetchPublication = async (
    node: ReadablePageNode, uid: string, publicationId: string
  ): Promise<Publication> => {
    const verdict = await verifier.component({ uid, publicationId, type: node.type })
    if (verdict === undefined) {
      return { ok: false, reason: `node-publication-absent: nothing is published at ${uid}/${publicationId}` }
    }
    if (!verdict.valid) return { ok: false, reason: verdict.reason }
    return { ok: true, value: verdict.value }
  }

  /**
   * The values for one node, with its children resolved first.
   *
   * Depth first, because a parent's slot *is* its resolved children — there is no node to describe
   * until everything beneath it has been described.
   */
  const valuesFor = async (
    publication: ComponentPublication,
    node: ReadablePageNode
  ): Promise<{ ok: true, value: ResolvedValue[] } | { ok: false, reason: string }> => {
    const names = attributeNames(publication)
    if (!names.ok) return { ok: false, reason: names.reason }

    const values: ResolvedValue[] = []
    for (const name of names.value) {
      if (!(name in node.data)) {
        return {
          ok: false,
          reason: `node-missing-attribute: '${node.component}' takes "${name}", which this page ` +
            'holds no value for'
        }
      }
      const value = node.data[name]
      if (!isSlot(value)) {
        values.push(value)
        continue
      }
      const children: ResolvedNode[] = []
      for (const child of value) {
        const resolved = await resolveNode(child)
        if (!resolved.ok) return { ok: false, reason: resolved.reason }
        children.push(resolved.value)
      }
      values.push(children)
    }
    return { ok: true, value: values }
  }

  const resolveNode = async (node: ReadablePageNode): Promise<Resolved> => {
    const published = await publicationFor(node)
    if (!published.ok) return refuse(published.reason)

    const { publication, executable } = published.value

    const values = await valuesFor(publication, node)
    if (!values.ok) return refuse(values.reason)

    return {
      ok: true,
      value: {
        component: node.component,
        name: publication.name,
        type: publication.type,
        publication,
        values: values.value,
        ...(executable === undefined ? {} : { executable })
      }
    }
  }

  return await resolveNode(tree)
}

export { resolvePage, isChildren, componentsUsed, missingComponents }
export type { ResolvedNode, ResolvedValue, Resolved }
