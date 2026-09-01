/**
 * What a component builds its nodes with.
 *
 * A component may not name `document`: from it, `defaultView` reaches `window` and through that
 * `eval`, `localStorage` and the network, in one hop. Banning the name closes every route through it
 * at once, and leaves nothing to build a node with — this is what replaces it.
 *
 * ## Built into a document with no browsing context
 *
 *     document.implementation.createHTMLDocument('')
 *       └─ defaultView === null      so a node's ownerDocument leads nowhere
 *
 * One per render, so nodes a component builds can be appended to one another without adoption. The
 * finished tree is adopted into the page when the renderer places it.
 *
 * ## What this does and does not cover
 *
 * It mediates **creation**. `element` refuses the tags that execute or fetch something by existing —
 * a `script` built here and inserted into the page runs, which is measured rather than assumed.
 *
 * It does **not** mediate the element afterwards. A component holding a real element can set an
 * inline event-handler attribute on it, and that handler is compiled against the page's window when
 * the event fires. **That vector is open by decision**, recorded in the claim boundary rather than
 * papered over: sanitizing the returned tree here was considered and declined.
 */

/** Tags that do something by being inserted, rather than by being looked at. */
const REFUSED_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'link', 'base', 'meta', 'frame', 'frameset'
])

/** The constructors a presentational component is given. */
interface DomFacade {
  element: (tag: string) => Element
  text: (value: string) => Text
  fragment: () => DocumentFragment
}

class RefusedTagError extends Error {
  constructor (readonly tag: string) {
    super(
      `dom-refused-tag: a component may not build a <${tag}>. It would act on the page by being ` +
      'inserted, rather than by being read.'
    )
    this.name = 'RefusedTag'
  }
}

/**
 * The document a component's nodes belong to while it runs.
 *
 * Created from the host's own implementation rather than by a library, so the nodes are the same
 * kind the page is made of and can simply be adopted rather than rebuilt.
 */
const inertDocumentFrom = (host: Document): Document =>
  host.implementation.createHTMLDocument('')

const facadeFor = (inert: Document): DomFacade => Object.freeze({
  element: (tag: string): Element => {
    const name = String(tag).toLowerCase()
    if (REFUSED_TAGS.has(name)) throw new RefusedTagError(name)
    return inert.createElement(name)
  },
  // Coerced rather than trusted: a component may pass anything, and a text node built from an object
  // would read `[object Object]` on the page rather than fail where the mistake was made.
  text: (value: string): Text => inert.createTextNode(String(value)),
  fragment: (): DocumentFragment => inert.createDocumentFragment()
})

/**
 * The document to build from, or nothing where there is none.
 *
 * A consumer may supply one — that is how server-side rendering of a dynamic component works.
 */
const hostDocument = (supplied?: Document): Document | undefined =>
  supplied ?? (globalThis as { document?: Document }).document

class NoDocumentError extends Error {
  constructor () {
    super(
      'no-document: this component builds DOM and this environment has none. Supply `document` to ' +
      'render it here.'
    )
    this.name = 'NoDocument'
  }
}

/**
 * The facade where there is no document at all.
 *
 * **GenoaCMS is headless**, so a consumer may be a native application with no DOM anywhere in it.
 * Refusing every dynamic component in that case would be far too blunt: a component that arranges
 * the children it was handed, or returns something built from `passthrough`, needs no document and
 * has done nothing wrong. So the parameter is always present, and only *using* it fails — the node
 * that tried is contained, and the page renders around it.
 */
const unavailable = (): DomFacade => Object.freeze({
  element: (): Element => { throw new NoDocumentError() },
  text: (): Text => { throw new NoDocumentError() },
  fragment: (): DocumentFragment => { throw new NoDocumentError() }
})

export { facadeFor, inertDocumentFrom, hostDocument, unavailable, REFUSED_TAGS, RefusedTagError, NoDocumentError }
export type { DomFacade }
