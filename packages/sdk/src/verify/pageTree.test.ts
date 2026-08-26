import { describe, it, expect } from 'vitest'
import { readPageTree, walkTree, pinnedRevisions } from './pageTree.js'
import type { ReadablePageNode } from './pageTree.js'

/**
 * Reading a verified payload as a page tree.
 *
 * Everything here happens **after** a signature has been checked. That is the point of it: a
 * signature attests to the bytes and not to their shape, so whoever holds the signing key can sign a
 * malformed tree, and a renderer must not be the thing that discovers it.
 */

const node = (over: Partial<ReadablePageNode> = {}): unknown => ({
  component: 'Hero',
  uid: 'component-1',
  publicationId: 'commit-1',
  data: {},
  ...over
})

const read = (candidate: unknown) => readPageTree(candidate as never)

describe('reading a tree', () => {
  it('reads a node and the revision it pins', () => {
    const result = read(node())

    expect(result).toEqual({
      ok: true,
      value: { component: 'Hero', uid: 'component-1', publicationId: 'commit-1', data: {} }
    })
  })

  it('reads a prebuilt node, which pins nothing', () => {
    const result = read({ component: 'Card', data: {} })

    expect(result.ok && 'publicationId' in result.value).toBe(false)
    expect(result.ok && 'uid' in result.value).toBe(false)
  })

  it('refuses a node pinned by halves', () => {
    // An artifact is at `{uid}/{publicationId}`; either alone is a pin nobody can resolve. Refused rather
    // than read as prebuilt, because a node naming a revision is asking for one to be run.
    expect(read({ component: 'Hero', publicationId: 'commit-1', data: {} }))
      .toEqual({ ok: false, reason: 'node-half-pinned' })
    expect(read({ component: 'Hero', uid: 'component-1', data: {} }))
      .toEqual({ ok: false, reason: 'node-half-pinned' })
  })

  it('reads scalar attributes as themselves', () => {
    const result = read(node({ data: { on: true, count: 3, heading: 'hello' } as never }))

    expect(result.ok && result.value.data).toEqual({ on: true, count: 3, heading: 'hello' })
  })

  it('reads a list of URLs', () => {
    const result = read(node({ data: { links: ['https://example.com', '/about'] } as never }))

    expect(result.ok && result.value.data.links).toEqual(['https://example.com', '/about'])
  })

  it('reads a slot as nested nodes', () => {
    const result = read(node({ data: { body: [node({ component: 'Card' })] } as never }))

    expect(result.ok && (result.value.data.body as ReadablePageNode[])[0].component).toBe('Card')
  })

  it('reads an empty list without having to know which kind it is', () => {
    // No links and no children look identical, and both render as nothing.
    expect(read(node({ data: { body: [] } as never }).ok)).toBeTruthy()
  })
})

describe('refusing a tree a renderer would have to guess about', () => {
  it.each([
    ['a payload that is not an object', 'a string', 'node-not-an-object'],
    ['a node with no component', { data: {} }, 'node-missing-component'],
    ['a node whose component is empty', { component: '', data: {} }, 'node-missing-component'],
    ['a node with no data', { component: 'Hero' }, 'node-missing-data']
  ])('refuses %s', (_why, candidate, reason) => {
    expect(read(candidate)).toEqual({ ok: false, reason })
  })

  it('refuses a publicationId that is present but not a string', () => {
    // It would otherwise reach the executable lookup as something that is neither a revision nor a
    // prebuilt node.
    expect(read(node({ publicationId: 7 as never })))
      .toEqual({ ok: false, reason: 'node-commit-id-not-a-string' })
  })

  it('refuses a malformed node nested inside a slot, naming where it was', () => {
    const result = read(node({ data: { body: [{ data: {} }] } as never }))

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain("at 'body'")
  })

  it('does not mistake a string attribute for a failure', () => {
    // The reason a result is discriminated rather than "the value, or a string explaining it": these
    // are perfectly ordinary headings.
    for (const heading of ['node-not-an-object', 'node-missing-data']) {
      expect(read(node({ data: { heading } as never }))).toMatchObject({ ok: true })
    }
  })
})

describe('walking a tree', () => {
  const tree = {
    component: 'Page',
    uid: 'uid-page',
    publicationId: 'commit-page',
    data: {
      body: [
        { component: 'Hero', uid: 'uid-hero', publicationId: 'commit-hero', data: {} },
        { component: 'Card', data: { links: ['https://example.com'] } }
      ]
    }
  } as ReadablePageNode

  it('yields every node, parents before children', () => {
    expect([...walkTree(tree)].map(n => n.component)).toEqual(['Page', 'Hero', 'Card'])
  })

  it('does not mistake a list of URLs for nodes', () => {
    expect([...walkTree(tree)].every(n => typeof n.component === 'string')).toBe(true)
  })

  it('lists the revisions the page pinned, and only those', () => {
    // The prebuilt node contributes nothing: there is no revision of it for the CMS to pin.
    expect(pinnedRevisions(tree)).toEqual([
      { uid: 'uid-page', publicationId: 'commit-page' },
      { uid: 'uid-hero', publicationId: 'commit-hero' }
    ])
  })
})
