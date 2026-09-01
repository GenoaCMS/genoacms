import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { facadeFor, inertDocumentFrom, hostDocument, unavailable, REFUSED_TAGS } from './dom.js'

/**
 * What a component can and cannot reach through the parameter it builds nodes with.
 *
 * A real DOM is used here, unlike the rest of these tests, because the claims are about what the
 * platform does with a node — which a stand-in shaped like one cannot answer.
 */

const page = () => new JSDOM('<!doctype html><body></body>').window.document

describe('the document a component builds into', () => {
  it('has no window to reach', () => {
    // The bypass this exists to close: from `document`, `defaultView` is `window`, and from there
    // `eval`, `localStorage` and the network.
    const inert = inertDocumentFrom(page())

    expect(inert.defaultView).toBeNull()
  })

  it('leaves a node it built leading nowhere', () => {
    const inert = inertDocumentFrom(page())

    const node = facadeFor(inert).element('div')

    expect(node.ownerDocument.defaultView).toBeNull()
  })

  it('is not the page own document', () => {
    const host = page()

    expect(inertDocumentFrom(host)).not.toBe(host)
  })
})

describe('what it will build', () => {
  const dom = () => facadeFor(inertDocumentFrom(page()))

  it('builds an ordinary element', () => {
    expect(dom().element('section').localName).toBe('section')
  })

  it('builds text, coercing what it was given', () => {
    // A component may pass anything. A text node reading `[object Object]` on the page is worse
    // than one reading what the value actually stringifies to.
    expect(dom().text(42 as unknown as string).data).toBe('42')
  })

  it('builds a fragment', () => {
    expect(dom().fragment().nodeType).toBe(11)
  })

  it.each([...REFUSED_TAGS])('refuses <%s>', (tag) => {
    expect(() => dom().element(tag)).toThrow(/dom-refused-tag/)
  })

  it('refuses a tag however it is capitalized', () => {
    expect(() => dom().element('ScRiPt')).toThrow(/dom-refused-tag/)
  })

  it('cannot have its methods replaced', () => {
    // Frozen for the reason the guard object is: unreachable state is worth nothing if the methods
    // reading it can be swapped for others.
    const facade = dom()

    expect(() => { (facade as { element: unknown }).element = () => undefined }).toThrow(TypeError)
  })
})

describe('the escape the denylist closes', () => {
  it('would run a script built here and inserted into the page', () => {
    // Measured rather than assumed, and the reason `script` is refused: a script element created in
    // a document with no browsing context still executes once it is adopted and inserted.
    const window = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously' }).window
    const host = window.document
    const inert = inertDocumentFrom(host)

    const script = inert.createElement('script')
    script.textContent = 'globalThis.__escaped = true'
    host.body.appendChild(host.adoptNode(script))

    expect((window as unknown as { __escaped?: boolean }).__escaped).toBe(true)
    // Which is why the facade will not build one.
    expect(() => facadeFor(inert).element('script')).toThrow(/dom-refused-tag/)
  })
})

describe('where there is no document at all', () => {
  it('still hands a component the parameter', () => {
    // GenoaCMS is headless. A component that arranges the children it was given, or returns
    // something built from `passthrough`, needs no document and has done nothing wrong.
    expect(Object.keys(unavailable()).sort()).toEqual(['element', 'fragment', 'text'])
  })

  it.each(['element', 'text', 'fragment'] as const)('fails only when %s is used', (method) => {
    expect(() => (unavailable()[method] as () => unknown)()).toThrow(/no-document/)
  })

  it('prefers a supplied document over the ambient one', () => {
    const supplied = page()

    expect(hostDocument(supplied)).toBe(supplied)
  })
})
