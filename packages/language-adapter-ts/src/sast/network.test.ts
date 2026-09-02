import { describe, it, expect } from 'vitest'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import adapter from '../index.js'

/**
 * Every way a component might ask for a URL, and what happens to each.
 *
 * **This is the claim `SAST-05` exists to support, written as an enumeration rather than a
 * sentence.** The rule bans the primitives; the bridge is the sanctioned route. The list is here so
 * that what is *not* refused is visible beside what is, because a claim about network isolation is
 * only worth what its gaps are known to be.
 *
 * Each route below was measured before it was written down. Four of them were open on 1 September
 * 2026 and are now closed; three remain open and are named rather than omitted.
 */

const shape: ComponentShape = { attributes: {}, attributeOrder: [] }

const rulesFor = async (body: string, fetchOrigins: readonly string[] = []): Promise<string[]> => {
  const result = await adapter.analyze({ body, shape, fetchOrigins })
  return [...new Set(result.diagnostics.map(one => (one as { rule?: string }).rule ?? ''))]
}

describe('asking for a URL by naming something', () => {
  it.each([
    ['fetch', 'return fetch("https://elsewhere.test")'],
    ['XMLHttpRequest', 'const r = new XMLHttpRequest(); r.open("GET", "https://elsewhere.test"); return null'],
    ['WebSocket', 'return new WebSocket("wss://elsewhere.test")'],
    ['EventSource', 'return new EventSource("https://elsewhere.test")'],
    ['Worker', 'return new Worker("https://elsewhere.test/w.js")'],
    ['SharedWorker', 'return new SharedWorker("https://elsewhere.test/w.js")'],
    ['Image', 'const i = new Image(); i.src = "https://elsewhere.test/p.png"; return null'],
    ['importScripts', 'return importScripts("https://elsewhere.test/s.js")']
  ])('refuses %s', async (_name, body) => {
    expect(await rulesFor(body)).toContain('SAST-05')
  })

  it('refuses navigator, which carries sendBeacon', async () => {
    // A global rather than a network primitive, so it is refused by the rule that owns globals.
    expect(await rulesFor('return navigator.sendBeacon("https://elsewhere.test", "d")'))
      .toContain('SAST-02')
  })

  it('refuses a module fetched as code', async () => {
    expect(await rulesFor('return import("https://elsewhere.test/m.js")')).toContain('SAST-06')
  })
})

describe('the two routes that are meant to work', () => {
  it('allows the bridge, for an origin the instance allowed', async () => {
    const rules = await rulesFor(
      'return bridge.fetch("https://api.example.com/orders")', ['https://api.example.com']
    )

    expect(rules).toEqual([])
  })

  it('refuses the bridge for an origin it did not', async () => {
    expect(await rulesFor('return bridge.fetch("https://elsewhere.test")', ['https://api.example.com']))
      .toContain('SAST-05')
  })

  it('says nothing about passthrough, which is the consumer\'s decision', async () => {
    // Stated rather than hidden: if a consuming application puts `fetch` in the capability object,
    // a component has the network and no rule here describes it. That boundary is the point of
    // `passthrough` existing, not an oversight in this rule.
    expect(await rulesFor('return passthrough.fetch("https://elsewhere.test")')).toEqual([])
  })
})

describe('what is still open, and named', () => {
  /*
   * A URL placed in markup the component builds. None of these is decidable by a rule about names:
   * the URL is a string on a node at run time, and the facade mediates *creating* a node rather than
   * what is then done to it. Closing them needs the returned tree sanitized at the consumer
   * boundary, which was considered and declined.
   *
   * They are asserted as *allowed* on purpose. A test that pretended otherwise would make the
   * network claim look complete, and the next person to widen it would have no way to see the edge.
   */
  it.each([
    ['a src attribute on a node it built', 'const i = dom.element("img"); i.setAttribute("src", "https://elsewhere.test/p.png"); return i'],
    ['a url() in an inline style', 'const d = dom.element("div"); d.setAttribute("style", "background:url(https://elsewhere.test/p.png)"); return d'],
    ['a srcset, which is the same thing spelled differently', 'const i = dom.element("img"); i.setAttribute("srcset", "https://elsewhere.test/p.png 1x"); return i']
  ])('does not refuse %s', async (_name, body) => {
    expect(await rulesFor(body)).toEqual([])
  })

  /*
   * One markup route *is* closed — a `<style>` element, which would both fetch through `@import` and
   * restyle the whole page. It is closed by the DOM facade refusing the tag rather than by any rule
   * here, so it is asserted where that list lives.
   */
})
