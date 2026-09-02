import { describe, it, expect, beforeEach } from 'vitest'
import { resolvePage, isChildren, componentsUsed, missingComponents } from './resolve.js'
import type { ResolvedNode } from './resolve.js'
import type { Verifier } from '../verify/client.js'
import type { ReadablePageNode } from '../verify/pageTree.js'

/**
 * Preparing a verified page for a renderer that is not the DOM one.
 *
 * **What this exists to make possible**: a consumer whose components are React, Vue or Svelte
 * components rather than functions returning nodes. Everything between verifying a page and building
 * a document is identical whatever the answer is made of — fetching each node's publication, checking
 * the pin, and joining the page's *keyed* values to the component's *positional* parameters — and
 * this is that work, on its own.
 *
 * Nothing here builds a node, evaluates a module or calls a component, and the tests below are
 * written so that a resolver which quietly started doing any of those would fail.
 */

interface AttributeSpec { reference: string, title: string }

const publicationOf = (
  over: {
    uid?: string
    publicationId?: string
    name?: string
    type?: 'prebuilt' | 'dynamic'
    attributes?: AttributeSpec[]
    code?: string
  } = {}
) => {
  const attributes = over.attributes ?? []
  return {
    uid: over.uid ?? 'component-1',
    publicationId: over.publicationId ?? 'publication-1',
    publisherId: 'someone',
    publishedAt: 0,
    note: '',
    type: over.type ?? 'prebuilt',
    name: over.name ?? 'Hero',
    attributes: Object.fromEntries(
      attributes.map(one => [one.reference, { uid: one.reference, schema: { title: one.title } }])
    ),
    attributeOrder: attributes.map(one => one.reference),
    ...(over.code === undefined
      ? {}
      : { executables: [{ platform: 'web-esmodule', executableCode: over.code, compiledAt: 0, ceilings: { maxFuel: 1000000, maxDepth: 100, maxAllocation: 10000000 } }] })
  }
}

const node = (over: Partial<ReadablePageNode> = {}): ReadablePageNode => ({
  component: 'Hero',
  type: 'prebuilt',
  uid: 'component-1',
  publicationId: 'publication-1',
  data: {},
  ...over
} as ReadablePageNode)

let answers: Map<string, unknown>
let asked: string[]

const verifier = {
  component: async ({ uid, publicationId }: { uid: string, publicationId: string }) => {
    asked.push(`${uid}/${publicationId}`)
    return answers.get(`${uid}/${publicationId}`)
  }
} as unknown as Verifier

const published = (publication: ReturnType<typeof publicationOf>) => {
  answers.set(`${publication.uid}/${publication.publicationId}`, {
    valid: true,
    value: {
      publication,
      ...(publication.executables === undefined ? {} : { executable: publication.executables[0] })
    }
  })
}

beforeEach(() => {
  answers = new Map()
  asked = []
})

describe('resolving one node', () => {
  it('carries the name the publication was released under', async () => {
    // Not the page's, which holds whatever the component was called when the page was built. A
    // consumer's component map is keyed by the stable one.
    published(publicationOf({ name: 'Hero' }))

    const resolved = await resolvePage(verifier, node({ component: 'RenamedSince' }))

    expect(resolved.ok && resolved.value.name).toBe('Hero')
    expect(resolved.ok && resolved.value.component).toBe('RenamedSince')
  })

  it('puts the values in the publication\'s parameter order', async () => {
    // **The join this exists for.** The page's keys are written in the opposite order on purpose: a
    // resolver reading `data` would hand them over the wrong way round, and every signature would
    // still be valid.
    published(publicationOf({
      attributes: [{ reference: 'a1', title: 'Heading' }, { reference: 'a2', title: 'Body' }]
    }))

    const resolved = await resolvePage(
      verifier, node({ data: { Body: 'second', Heading: 'first' } as never })
    )

    expect(resolved.ok && resolved.value.values).toEqual(['first', 'second'])
  })

  it('reports which kind of component it is', async () => {
    published(publicationOf({ type: 'dynamic', code: 'export default () => 1' }))

    const resolved = await resolvePage(verifier, node({ type: 'dynamic' }))

    expect(resolved.ok && resolved.value.type).toBe('dynamic')
  })

  it('carries the bundle for a dynamic component and none for a prebuilt one', async () => {
    // A wrapper reads this to decide whether to render the subtree itself or hand it to the DOM
    // renderer, so its presence is the whole signal.
    published(publicationOf({ type: 'dynamic', code: 'export default () => 1' }))
    const dynamic = await resolvePage(verifier, node({ type: 'dynamic' }))

    answers.clear()
    published(publicationOf())
    const prebuilt = await resolvePage(verifier, node())

    expect(dynamic.ok && dynamic.value.executable?.executableCode).toContain('export default')
    expect(prebuilt.ok && 'executable' in prebuilt.value).toBe(false)
  })

  it('does not evaluate the bundle it carries', async () => {
    // Resolution is framework-agnostic and side-effect free. A resolver that loaded modules would
    // run an author's code before a consumer had decided to render anything.
    published(publicationOf({ type: 'dynamic', code: 'globalThis.__evaluated = true' }))

    await resolvePage(verifier, node({ type: 'dynamic' }))

    expect((globalThis as Record<string, unknown>).__evaluated).toBeUndefined()
  })

  it('passes a list of resolved URLs through unchanged', async () => {
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Links' }] }))

    const resolved = await resolvePage(
      verifier, node({ data: { Links: ['https://example.com'] } as never })
    )

    expect(resolved.ok && resolved.value.values).toEqual([['https://example.com']])
  })
})

describe('resolving children', () => {
  const withChild = () => {
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Body' }] }))
    published(publicationOf({ uid: 'component-2', publicationId: 'publication-2', name: 'Card' }))
  }

  const child = (): ReadablePageNode =>
    node({ component: 'Card', uid: 'component-2', publicationId: 'publication-2' })

  it('resolves a slot into resolved nodes rather than page nodes', async () => {
    withChild()

    const resolved = await resolvePage(verifier, node({ data: { Body: [child()] } as never }))
    const slot = resolved.ok ? resolved.value.values[0] : undefined

    expect(isChildren(slot as never)).toBe(true)
    expect((slot as ResolvedNode[])[0].name).toBe('Card')
  })

  it('keeps the children in the order the page holds them', async () => {
    withChild()
    published(publicationOf({ uid: 'component-3', publicationId: 'publication-3', name: 'Other' }))
    const other = node({ component: 'Other', uid: 'component-3', publicationId: 'publication-3' })

    const resolved = await resolvePage(verifier, node({ data: { Body: [other, child()] } as never }))
    const slot = resolved.ok ? resolved.value.values[0] as ResolvedNode[] : []

    expect(slot.map(one => one.name)).toEqual(['Other', 'Card'])
  })

  it('resolves to whatever depth the page has', async () => {
    withChild()
    const nested = node({ data: { Body: [child()] } as never })

    const resolved = await resolvePage(verifier, node({ data: { Body: [nested] } as never }))
    const outer = resolved.ok ? resolved.value.values[0] as ResolvedNode[] : []
    const inner = outer[0].values[0] as ResolvedNode[]

    expect(inner[0].name).toBe('Card')
  })

  it('resolves an empty slot to an empty list, not to a list of URLs', async () => {
    withChild()

    const resolved = await resolvePage(verifier, node({ data: { Body: [] } as never }))

    expect(resolved.ok && resolved.value.values).toEqual([[]])
  })

  it('fails the whole page for a fault in a child', async () => {
    // A child whose publication does not verify is not a child to leave out. There is no safe
    // partial version of a tampered page.
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Body' }] }))
    answers.set('component-2/publication-2', { valid: false, reason: 'signature-invalid' })

    const resolved = await resolvePage(verifier, node({ data: { Body: [child()] } as never }))

    expect(resolved.ok).toBe(false)
  })
})

describe('what fails the page', () => {
  /*
   * Everything resolution can discover is a fact about the **documents** — tampering, or two signed
   * documents disagreeing. The other kind of failure, a verified artifact whose code will not run,
   * cannot arise here because nothing here runs anything.
   */

  it('refuses a node that was never published', async () => {
    const resolved = await resolvePage(
      verifier, { component: 'Hero', type: 'prebuilt', data: {} } as ReadablePageNode
    )

    expect(!resolved.ok && resolved.reason).toContain('node-unpublished')
  })

  it('refuses when nothing is published at the pin', async () => {
    const resolved = await resolvePage(verifier, node())

    expect(!resolved.ok && resolved.reason).toContain('node-publication-absent')
  })

  it('refuses a publication that does not verify', async () => {
    answers.set('component-1/publication-1', { valid: false, reason: 'signature-invalid' })

    const resolved = await resolvePage(verifier, node())

    expect(!resolved.ok && resolved.reason).toBe('signature-invalid')
  })

  it('refuses a page holding no value for a parameter', async () => {
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Heading' }] }))

    const resolved = await resolvePage(verifier, node({ data: {} }))

    expect(!resolved.ok && resolved.reason).toContain('node-missing-attribute')
  })

  it('refuses a publication whose attributes share a name', async () => {
    published(publicationOf({
      attributes: [{ reference: 'a1', title: 'Heading' }, { reference: 'a2', title: 'Heading' }]
    }))

    const resolved = await resolvePage(verifier, node({ data: { Heading: 'x' } as never }))

    expect(!resolved.ok && resolved.reason).toContain('publication-duplicate-attribute-name')
  })
})

describe('fetching one publication once', () => {
  const threeCards = (): ReadablePageNode => {
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Body' }] }))
    published(publicationOf({ uid: 'component-2', publicationId: 'publication-2', name: 'Card' }))
    const card = node({ component: 'Card', uid: 'component-2', publicationId: 'publication-2' })
    return node({ data: { Body: [card, card, card] } as never })
  }

  it('verifies a repeated publication once', async () => {
    await resolvePage(verifier, threeCards())

    expect(asked.filter(one => one === 'component-2/publication-2')).toHaveLength(1)
  })

  it('still resolves a node per placement', async () => {
    // Caching the publication must not become caching the node: three placements are three nodes,
    // and two nodes of one component carry different values.
    const resolved = await resolvePage(verifier, threeCards())
    const slot = resolved.ok ? resolved.value.values[0] as ResolvedNode[] : []

    expect(slot).toHaveLength(3)
  })

  it('gives two placements their own values', async () => {
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Body' }] }))
    published(publicationOf({
      uid: 'component-2',
      publicationId: 'publication-2',
      name: 'Card',
      attributes: [{ reference: 'b1', title: 'Title' }]
    }))
    const card = (title: string) => node({
      component: 'Card', uid: 'component-2', publicationId: 'publication-2',
      data: { Title: title } as never
    })

    const resolved = await resolvePage(
      verifier, node({ data: { Body: [card('one'), card('two')] } as never })
    )
    const slot = resolved.ok ? resolved.value.values[0] as ResolvedNode[] : []

    expect(slot.map(one => one.values[0])).toEqual(['one', 'two'])
  })

  it('reaches a refusal once rather than per placement', async () => {
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Body' }] }))
    answers.set('component-2/publication-2', { valid: false, reason: 'signature-invalid' })
    const card = node({ component: 'Card', uid: 'component-2', publicationId: 'publication-2' })

    await resolvePage(verifier, node({ data: { Body: [card, card, card] } as never }))

    expect(asked.filter(one => one === 'component-2/publication-2')).toHaveLength(1)
  })
})

describe('telling a consumer what it has not supplied', () => {
  /*
   * **The rule lives here rather than in each wrapper**, because it is easy to get wrong in a way
   * nothing reveals: a page naming a component the consumer does not have must be *refused*, not
   * rendered with a gap. Four wrappers each deciding that for themselves is four chances to serve a
   * page quietly missing part of itself.
   */
  const tree = (): ResolvedNode => ({
    component: 'Page', name: 'Page', type: 'prebuilt',
    publication: {} as never,
    values: [[
      { component: 'Card', name: 'Card', type: 'prebuilt', publication: {} as never, values: [] },
      { component: 'Hero', name: 'Hero', type: 'dynamic', publication: {} as never, values: [] }
    ]]
  })

  it('lists every component a tree uses, each once', () => {
    expect(componentsUsed(tree())).toEqual(['Page', 'Card', 'Hero'])
  })

  it('names what is missing', () => {
    expect(missingComponents(tree(), ['Page'])).toEqual(['Card'])
  })

  it('says nothing when everything is supplied', () => {
    expect(missingComponents(tree(), ['Page', 'Card'])).toEqual([])
  })

  it('does not ask a consumer for a dynamic component', () => {
    // Its code came from the CMS and arrives in the publication, so there is nothing to supply.
    expect(missingComponents(tree(), ['Page', 'Card'])).not.toContain('Hero')
  })
})

describe('telling a slot from a list of URLs', () => {
  it('recognizes children', () => {
    expect(isChildren([{ name: 'Card' } as ResolvedNode])).toBe(true)
  })

  it('does not mistake a list of URLs for children', () => {
    expect(isChildren(['https://example.com'])).toBe(false)
  })

  it('does not mistake text for children', () => {
    expect(isChildren('Heading')).toBe(false)
    expect(isChildren(42)).toBe(false)
    expect(isChildren(true)).toBe(false)
  })
})
