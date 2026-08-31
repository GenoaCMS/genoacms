import { describe, it, expect, beforeEach } from 'vitest'
import { renderPage } from './render.js'
import type { Verifier } from '../verify/client.js'
import type { ReadablePageNode } from '../verify/pageTree.js'

/**
 * Rendering a verified tree.
 *
 * Everything here starts from a tree a verifier has already accepted. What is left is the second
 * signature — each node's publication — and what happens when the code inside a verified one turns
 * out to be wrong.
 *
 * **The property these are organized around is the failure split.** A fault in the *documents* fails
 * the whole page, because the plausible tampering leaves something that looks entirely ordinary and
 * rendering the rest would be rendering whatever was written to the bucket. A fault in the *code*
 * fails one node, because an author's bug is not grounds for failing a request. Nearly half of what
 * follows exists to pin down which side of that line each fault falls on, since a renderer that got
 * it backwards would look correct on every page where nothing is wrong.
 *
 * No DOM is used. The SDK builds no nodes — components do — so a node here is anything shaped like
 * one, which is also exactly what the renderer checks for and why it checks that way.
 */

/** Something a renderer will accept as a node, without a document to make one. */
const element = (name: string, children: unknown[] = []): Node =>
  ({ nodeType: 1, nodeName: name, children }) as unknown as Node

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
      : { executables: [{ platform: 'web-esmodule', executableCode: over.code, compiledAt: 0 }] })
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

/** What the verifier answers for each pin, and how many times it was asked. */
let answers: Map<string, unknown>
let asked: string[]

const verifier = {
  component: async ({ uid, publicationId }: { uid: string, publicationId: string }) => {
    const key = `${uid}/${publicationId}`
    asked.push(key)
    return answers.get(key)
  }
} as unknown as Verifier

/** Publishes a prebuilt component that a consumer supplies under `name`. */
const published = (publication: ReturnType<typeof publicationOf>) => {
  answers.set(`${publication.uid}/${publication.publicationId}`, { valid: true, value: {
    publication,
    ...(publication.executables === undefined ? {} : { executable: publication.executables[0] })
  } })
}

beforeEach(() => {
  answers = new Map()
  asked = []
})

describe('rendering a node', () => {
  it('returns what the consumer\'s component built', async () => {
    published(publicationOf())
    const hero = element('SECTION')

    const rendered = await renderPage(verifier, node(), { components: { Hero: () => hero } })

    expect(rendered.ok && rendered.value).toBe(hero)
  })

  it('resolves a prebuilt component by the name the publication carries', async () => {
    // Not by the node's, which holds whatever the component was called when the *page* was built. A
    // publication is immutable, so the name it was released under is the stable one — renaming a
    // component between publishing it and building a page makes the two differ legitimately.
    published(publicationOf({ name: 'Hero' }))

    const rendered = await renderPage(
      verifier,
      node({ component: 'RenamedSincePublication' }),
      { components: { Hero: () => element('SECTION') } }
    )

    expect(rendered.ok).toBe(true)
  })

  it('reports an empty list of failures when nothing went wrong', async () => {
    published(publicationOf())

    const rendered = await renderPage(verifier, node(), { components: { Hero: () => element('DIV') } })

    expect(rendered.ok && rendered.failures).toEqual([])
  })
})

describe('passing values to parameters', () => {
  it('passes them in the publication\'s order, not the page\'s', async () => {
    // **The property the resolution seam exists for.** A component's attributes are positional and a node's data is
    // keyed, so the order has to come from the signed publication. Written with the page's keys in
    // the opposite order, so a renderer reading `data` would pass them the wrong way round and this
    // would fail.
    published(publicationOf({
      attributes: [{ reference: 'a1', title: 'Heading' }, { reference: 'a2', title: 'Body' }]
    }))
    let received: unknown[] = []

    await renderPage(
      verifier,
      node({ data: { Body: 'second', Heading: 'first' } as never }),
      { components: { Hero: (...values: unknown[]) => { received = values; return element('DIV') } } }
    )

    expect(received).toEqual(['first', 'second'])
  })

  it('looks a value up by the attribute\'s name and finds it through the uid', async () => {
    // The join this whole path rests on: the order is uids, the page's keys are names, and the
    // publication's attributes are what connects them.
    published(publicationOf({ attributes: [{ reference: 'ref-9f2c', title: 'Heading' }] }))
    let received: unknown[] = []

    await renderPage(
      verifier,
      node({ data: { Heading: 'Welcome' } as never }),
      { components: { Hero: (...values: unknown[]) => { received = values; return element('DIV') } } }
    )

    // A prebuilt component is the consumer's own code and receives its attributes and nothing else.
    expect(received).toEqual(['Welcome'])
  })

  it('passes a list of resolved URLs through as it stands', async () => {
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Links' }] }))
    let received: unknown[] = []

    await renderPage(
      verifier,
      node({ data: { Links: ['https://example.com'] } as never }),
      { components: { Hero: (...values: unknown[]) => { received = values; return element('DIV') } } }
    )

    expect(received).toEqual([['https://example.com']])
  })

  it('refuses a page holding no value for a parameter', async () => {
    // The page and the publication it pinned were written from one description, so a gap means one
    // of the two has been changed since. Calling anyway would leave the parameter undefined with
    // nothing to say which of the two documents is wrong.
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Heading' }] }))

    const rendered = await renderPage(verifier, node({ data: {} }), {
      components: { Hero: () => element('DIV') }
    })

    expect(rendered.ok).toBe(false)
    expect(!rendered.ok && rendered.reason).toContain('node-missing-attribute')
  })

  it('refuses a publication whose attributes share a name', async () => {
    // The CMS refuses to save one, but publications are immutable and a page pins one — a release
    // made before that rule existed is still out there and still verifies. The page would store one
    // value where two belong.
    published(publicationOf({
      attributes: [{ reference: 'a1', title: 'Heading' }, { reference: 'a2', title: 'Heading' }]
    }))

    const rendered = await renderPage(verifier, node({ data: { Heading: 'x' } as never }), {
      components: { Hero: () => element('DIV') }
    })

    expect(!rendered.ok && rendered.reason).toContain('publication-duplicate-attribute-name')
  })

  it('refuses an order naming an attribute the publication does not describe', async () => {
    const publication = publicationOf({ attributes: [{ reference: 'a1', title: 'Heading' }] })
    publication.attributeOrder = ['a1', 'a2']
    published(publication)

    const rendered = await renderPage(verifier, node({ data: { Heading: 'x' } as never }), {
      components: { Hero: () => element('DIV') }
    })

    expect(!rendered.ok && rendered.reason).toContain('publication-unknown-attribute')
  })
})

describe('slots', () => {
  const withChild = () => {
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Body' }] }))
    published(publicationOf({
      uid: 'component-2', publicationId: 'publication-2', name: 'Card'
    }))
  }

  const parent = (...children: ReadablePageNode[]): ReadablePageNode =>
    node({ data: { Body: children } as never })

  const child = (): ReadablePageNode =>
    node({ component: 'Card', uid: 'component-2', publicationId: 'publication-2' })

  it('hands a component its children already rendered', async () => {
    withChild()
    const card = element('ARTICLE')
    let received: unknown[] = []

    await renderPage(verifier, parent(child()), {
      components: {
        Hero: (...values: unknown[]) => { received = values; return element('SECTION') },
        Card: () => card
      }
    })

    expect(received).toEqual([[card]])
  })

  it('keeps the children in the order the page holds them', async () => {
    withChild()
    let made = 0
    let received: Node[] = []

    await renderPage(verifier, parent(child(), child(), child()), {
      components: {
        Hero: (children: Node[]) => { received = children; return element('SECTION') },
        // Numbered as they are built, so the assertion below is about the order the slot arrives in
        // rather than about three interchangeable nodes.
        Card: () => element(`CARD-${made++}`)
      }
    })

    expect(received.map(one => one.nodeName)).toEqual(['CARD-0', 'CARD-1', 'CARD-2'])
  })

  it('calls a parent only after every child beneath it', async () => {
    withChild()
    const order: string[] = []

    await renderPage(verifier, parent(child()), {
      components: {
        Hero: () => { order.push('parent'); return element('SECTION') },
        Card: () => { order.push('child'); return element('ARTICLE') }
      }
    })

    expect(order).toEqual(['child', 'parent'])
  })

  it('does not mistake an empty slot for a list of URLs', async () => {
    withChild()
    let received: unknown[] = []

    await renderPage(verifier, parent(), {
      components: { Hero: (...values: unknown[]) => { received = values; return element('SECTION') } }
    })

    expect(received).toEqual([[]])
  })
})

describe('a fault in the documents fails the page', () => {
  /*
   * Every one of these is either tampering or a consumer that is not configured for this page, and
   * the plausible tampering leaves a document that looks entirely ordinary. Rendering the rest would
   * be rendering whatever was written to the bucket, minus the part that gave it away.
   */

  it('refuses when a publication does not verify', async () => {
    answers.set('component-1/publication-1', { valid: false, reason: 'signature-invalid' })

    const rendered = await renderPage(verifier, node(), { components: { Hero: () => element('DIV') } })

    expect(!rendered.ok && rendered.reason).toBe('signature-invalid')
  })

  it('refuses when nothing is published at the pin', async () => {
    const rendered = await renderPage(verifier, node(), { components: { Hero: () => element('DIV') } })

    expect(!rendered.ok && rendered.reason).toContain('node-publication-absent')
  })

  it('refuses a node that was never published', async () => {
    const rendered = await renderPage(
      verifier,
      { component: 'Hero', type: 'prebuilt', data: {} } as ReadablePageNode,
      { components: { Hero: () => element('DIV') } }
    )

    expect(!rendered.ok && rendered.reason).toContain('node-unpublished')
  })

  it('refuses when the consumer supplied no component of that name', async () => {
    // A consumer that has not been given the components this page is built from. Not a fault in the
    // page, and every other node of that component would fail identically.
    published(publicationOf())

    const rendered = await renderPage(verifier, node(), { components: {} })

    expect(!rendered.ok && rendered.reason).toContain('component-not-supplied')
  })

  it('refuses when what the consumer supplied is not callable', async () => {
    published(publicationOf())

    const rendered = await renderPage(verifier, node(), {
      components: { Hero: 'a string' as never }
    })

    expect(!rendered.ok && rendered.reason).toContain('component-not-a-function')
  })

  it('fails the whole page for a fault in a child, not just that child', async () => {
    // **The test that keeps the split honest in the direction that matters.** Containing this would
    // serve a page with the tampered node quietly missing from it.
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Body' }] }))
    answers.set('component-2/publication-2', { valid: false, reason: 'signature-invalid' })

    const rendered = await renderPage(
      verifier,
      node({ data: { Body: [node({ uid: 'component-2', publicationId: 'publication-2' })] } as never }),
      { components: { Hero: () => element('SECTION') } }
    )

    expect(rendered.ok).toBe(false)
  })
})

describe('a fault in the code fails one node', () => {
  const parentOf = (...children: ReadablePageNode[]): ReadablePageNode => {
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Body' }] }))
    return node({ data: { Body: children } as never })
  }

  const broken = (name: string, publicationId: string): ReadablePageNode => {
    published(publicationOf({ uid: 'component-2', publicationId, name }))
    return node({ component: name, uid: 'component-2', publicationId })
  }

  it('leaves a child out when its component throws, and renders the rest', async () => {
    const tree = parentOf(broken('Bad', 'publication-2'))
    let received: unknown[] = []

    const rendered = await renderPage(verifier, tree, {
      components: {
        Hero: (...values: unknown[]) => { received = values; return element('SECTION') },
        Bad: () => { throw new Error('author bug') }
      }
    })

    expect(rendered.ok).toBe(true)
    expect(received).toEqual([[]])
  })

  it('reports the node that failed and the reason', async () => {
    const tree = parentOf(broken('Bad', 'publication-2'))

    const rendered = await renderPage(verifier, tree, {
      components: {
        Hero: () => element('SECTION'),
        Bad: () => { throw new Error('author bug') }
      }
    })

    expect(rendered.ok && rendered.failures).toEqual([
      { component: 'Bad', reason: expect.stringContaining('component-threw') }
    ])
  })

  it('invents nothing in the failed child\'s place', async () => {
    // A stand-in would put something on the page that no component produced, which is worse than a
    // gap: it is content nobody signed.
    const tree = parentOf(broken('Bad', 'publication-2'), broken('Bad', 'publication-2'))
    let received: Node[] = []

    await renderPage(verifier, tree, {
      components: {
        Hero: (children: Node[]) => { received = children; return element('SECTION') },
        Bad: () => { throw new Error('author bug') }
      }
    })

    expect(received).toEqual([])
  })

  it('refuses a component that returns something other than a node', async () => {
    published(publicationOf())

    const rendered = await renderPage(verifier, node(), {
      components: { Hero: () => 'a string of HTML' }
    })

    expect(!rendered.ok && rendered.reason).toContain('component-returned-not-a-node')
  })

  it('fails the page when it is the root whose code will not run', async () => {
    // The one place the two rules meet: containing a root failure would leave nothing to return.
    published(publicationOf())

    const rendered = await renderPage(verifier, node(), {
      components: { Hero: () => { throw new Error('author bug') } }
    })

    expect(rendered.ok).toBe(false)
    expect(!rendered.ok && rendered.reason).toContain('component-threw')
  })
})

describe('a component stopped by its own guard', () => {
  /*
   * A budget running out is not an author's bug, and a consumer deciding whether a page is worth
   * showing wants to know which of the two it met.
   *
   *     page ──┬── Hero          renders
   *            └── Runaway       guard-exhausted: fuel (limit 1000)   ← contained here
   *            page still renders
   */
  const tripped = (guard: string, limit: number) =>
    Object.assign(new Error(`over its ${guard} budget`), { name: 'GuardExhausted', guard, limit })

  const parentOf = (...children: ReadablePageNode[]): ReadablePageNode => {
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Body' }] }))
    return node({ data: { Body: children } as never })
  }

  const runaway = (): ReadablePageNode => {
    published(publicationOf({ uid: 'component-2', publicationId: 'publication-2', name: 'Runaway' }))
    return node({ component: 'Runaway', uid: 'component-2', publicationId: 'publication-2' })
  }

  it('renders the page around it', async () => {
    const rendered = await renderPage(verifier, parentOf(runaway()), {
      components: {
        Hero: () => element('SECTION'),
        Runaway: () => { throw tripped('fuel', 1_000) }
      }
    })

    expect(rendered.ok).toBe(true)
  })

  it('names the guard that stopped it, and the limit it reached', async () => {
    const rendered = await renderPage(verifier, parentOf(runaway()), {
      components: {
        Hero: () => element('SECTION'),
        Runaway: () => { throw tripped('allocation', 250) }
      }
    })

    expect(rendered.ok && rendered.failures).toEqual([
      { component: 'Runaway', reason: 'guard-exhausted: allocation (limit 250)' }
    ])
  })

  it('does not report it as an author bug', async () => {
    const rendered = await renderPage(verifier, parentOf(runaway()), {
      components: {
        Hero: () => element('SECTION'),
        Runaway: () => { throw tripped('depth', 100) }
      }
    })

    expect(rendered.ok && rendered.failures[0].reason).not.toContain('component-threw')
  })

  it('accepts a trip thrown in another realm', async () => {
    // The case `instanceof` gets wrong: a consumer running components in a worker gets an error
    // whose constructor is a different object.
    const foreign = { name: 'GuardExhausted', guard: 'fuel', limit: 1_000, message: 'over budget' }

    const rendered = await renderPage(verifier, parentOf(runaway()), {
      components: {
        Hero: () => element('SECTION'),
        Runaway: () => { throw foreign }
      }
    })

    expect(rendered.ok && rendered.failures[0].reason).toContain('guard-exhausted: fuel')
  })

  it('still reports an ordinary throw as an author bug', async () => {
    const rendered = await renderPage(verifier, parentOf(runaway()), {
      components: {
        Hero: () => element('SECTION'),
        Runaway: () => { throw new Error('author bug') }
      }
    })

    expect(rendered.ok && rendered.failures[0].reason).toContain('component-threw')
  })

  it('does not take a component at its word about having been guarded', async () => {
    // A component's own code can throw an error wearing the name. Without the family being checked
    // too, an author could report their bug as a bound doing its job.
    const rendered = await renderPage(verifier, parentOf(runaway()), {
      components: {
        Hero: () => element('SECTION'),
        Runaway: () => { throw Object.assign(new Error('nice try'), { name: 'GuardExhausted' }) }
      }
    })

    expect(rendered.ok && rendered.failures[0].reason).toContain('component-threw')
  })

  it('fails the page when the root is the one that tripped', async () => {
    // The failure split's one meeting point, unchanged by the guards: containing a root failure
    // would leave nothing to return.
    published(publicationOf())

    const rendered = await renderPage(verifier, node(), {
      components: { Hero: () => { throw tripped('fuel', 1_000) } }
    })

    expect(rendered.ok).toBe(false)
    expect(!rendered.ok && rendered.reason).toContain('guard-exhausted: fuel')
  })
})

describe('a dynamic component', () => {
  const dynamic = (code: string) => {
    published(publicationOf({ type: 'dynamic', code }))
    return node({ type: 'dynamic' })
  }

  it('runs the entry function out of its published bundle', async () => {
    const built = element('SECTION')
    const tree = dynamic('ignored')

    const rendered = await renderPage(verifier, tree, {
      loader: async () => ({ default: () => built })
    })

    expect(rendered.ok && rendered.value).toBe(built)
  })

  it('is not given to a prebuilt component, whose code the consumer already owns', async () => {
    // The boundary of the channel. A prebuilt component is this application's own function and can
    // close over anything it needs, so handing it a capability object would add an argument its
    // author never declared and shift nothing into place.
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Heading' }] }))
    let received: unknown[] = []

    await renderPage(
      verifier,
      node({ data: { Heading: 'Welcome' } as never }),
      {
        passthrough: { locale: {} },
        components: { Hero: (...values: unknown[]) => { received = values; return element('DIV') } }
      }
    )

    expect(received).toEqual(['Welcome'])
  })

  it('receives what the consumer supplied, after its attributes', async () => {
    const locale = { format: (value: string) => value }
    published(publicationOf({
      type: 'dynamic',
      code: 'ignored',
      attributes: [{ reference: 'a1', title: 'Heading' }]
    }))
    let received: unknown[] = []

    await renderPage(
      verifier,
      node({ type: 'dynamic', data: { Heading: 'Welcome' } as never }),
      {
        passthrough: { locale },
        loader: async () => ({ default: (...values: unknown[]) => { received = values; return element('DIV') } })
      }
    )

    expect(received).toEqual(['Welcome', { locale }])
  })

  it('gives every component the same object, not a copy each', async () => {
    // By reference, so a capability holding state is one capability. Building it per invocation
    // would make that silently impossible and is the obvious way to write this wrongly.
    const supplied = { shared: {} }
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Body' }] }))
    published(publicationOf({
      uid: 'component-2',
      publicationId: 'publication-2',
      name: 'Card',
      type: 'dynamic',
      code: 'ignored'
    }))
    const card = node({
      component: 'Card',
      type: 'dynamic',
      uid: 'component-2',
      publicationId: 'publication-2'
    })
    const seen: unknown[] = []

    await renderPage(verifier, node({ data: { Body: [card, card] } as never }), {
      passthrough: supplied,
      components: { Hero: () => element('SECTION') },
      loader: async () => ({
        default: (...values: unknown[]) => { seen.push(values.at(-1)); return element('ARTICLE') }
      })
    })

    expect(seen).toHaveLength(2)
    for (const one of seen) expect(one).toBe(supplied)
  })

  it('is called with its values in order, like any other component', async () => {
    published(publicationOf({
      type: 'dynamic',
      code: 'ignored',
      attributes: [{ reference: 'a1', title: 'Heading' }]
    }))
    let received: unknown[] = []

    await renderPage(
      verifier,
      node({ type: 'dynamic', data: { Heading: 'Welcome' } as never }),
      { loader: async () => ({ default: (...values: unknown[]) => { received = values; return element('DIV') } }) }
    )

    // The capability object follows the attributes, which are addressed by position.
    expect(received).toEqual(['Welcome', {}])
  })

  it('does not consult the prebuilt map for a component that published code', async () => {
    const tree = dynamic('ignored')

    const rendered = await renderPage(verifier, tree, {
      loader: async () => ({ default: () => element('FROM-BUNDLE') }),
      components: { Hero: () => element('FROM-MAP') }
    })

    expect(rendered.ok && rendered.value.nodeName).toBe('FROM-BUNDLE')
  })

  it('contains a bundle that will not evaluate to the node that used it', async () => {
    // A verified artifact that is simply wrong. Its signature is fine; its code is not.
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Body' }] }))
    published(publicationOf({ uid: 'component-2', publicationId: 'publication-2', type: 'dynamic', code: 'throw new Error("boom")' }))

    const rendered = await renderPage(
      verifier,
      node({ data: { Body: [node({ type: 'dynamic', uid: 'component-2', publicationId: 'publication-2' })] } as never }),
      { components: { Hero: () => element('SECTION') } }
    )

    expect(rendered.ok).toBe(true)
    expect(rendered.ok && rendered.failures[0].reason).toContain('module-evaluation-failed')
  })

  it('contains a bundle with no default export', async () => {
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Body' }] }))
    published(publicationOf({ uid: 'component-2', publicationId: 'publication-2', type: 'dynamic', code: 'ignored' }))

    const rendered = await renderPage(
      verifier,
      node({ data: { Body: [node({ type: 'dynamic', uid: 'component-2', publicationId: 'publication-2' })] } as never }),
      {
        components: { Hero: () => element('SECTION') },
        loader: async () => ({ named: () => element('DIV') })
      }
    )

    expect(rendered.ok && rendered.failures[0].reason).toContain('executable-missing-export')
  })
})

describe('resolving one publication once', () => {
  /*
   * A page placing one card twenty times pins one publication twenty times. Verifying it each time
   * would be twenty signature checks for one answer, and evaluating its bundle each time would
   * produce twenty modules — each with its own copy of whatever module state the author wrote.
   */

  const threeCards = (): ReadablePageNode => {
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Body' }] }))
    published(publicationOf({ uid: 'component-2', publicationId: 'publication-2', name: 'Card' }))
    const card = node({ component: 'Card', uid: 'component-2', publicationId: 'publication-2' })
    return node({ data: { Body: [card, card, card] } as never })
  }

  it('verifies a repeated publication once', async () => {
    await renderPage(verifier, threeCards(), {
      components: { Hero: () => element('SECTION'), Card: () => element('ARTICLE') }
    })

    expect(asked.filter(one => one === 'component-2/publication-2')).toHaveLength(1)
  })

  it('evaluates a repeated bundle once', async () => {
    published(publicationOf({ attributes: [{ reference: 'a1', title: 'Body' }] }))
    published(publicationOf({
      uid: 'component-2', publicationId: 'publication-2', type: 'dynamic', code: 'ignored'
    }))
    const card = node({ component: 'Card', type: 'dynamic', uid: 'component-2', publicationId: 'publication-2' })
    let evaluated = 0

    await renderPage(verifier, node({ data: { Body: [card, card, card] } as never }), {
      components: { Hero: () => element('SECTION') },
      loader: async () => { evaluated += 1; return { default: () => element('ARTICLE') } }
    })

    expect(evaluated).toBe(1)
  })

  it('still calls the component once per node', async () => {
    // Resolving once must not turn into rendering once — three placements are three nodes.
    let calls = 0

    await renderPage(verifier, threeCards(), {
      components: { Hero: () => element('SECTION'), Card: () => { calls += 1; return element('ARTICLE') } }
    })

    expect(calls).toBe(3)
  })

  it('remembers nothing between two renders', async () => {
    const tree = threeCards()

    await renderPage(verifier, tree, {
      components: { Hero: () => element('SECTION'), Card: () => element('ARTICLE') }
    })
    await renderPage(verifier, tree, {
      components: { Hero: () => element('SECTION'), Card: () => element('ARTICLE') }
    })

    expect(asked.filter(one => one === 'component-2/publication-2')).toHaveLength(2)
  })
})
