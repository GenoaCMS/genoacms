import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReadablePageNode } from './types'

/**
 * Answering what a component deletion would break.
 *
 * Two things are built on the same scan: the **warning** a confirmation shows, and the **refusal**
 * that stops the deletion whichever surface it came from.
 *
 * R6 accepted the break and Q4 answered it by informing. Using the CMS showed that was not enough: a
 * warning belongs to a surface, there are four ways to delete a component, and the one without a
 * warning is the one that silently breaks a site. So the rule moved below all four and the warning
 * became the explanation rather than the protection.
 *
 * The case that carries this file is the **unreadable** one, and the two halves answer it
 * differently on purpose. A tree that does not verify is a page nobody can answer for, so the
 * confirmation names it — but it is also a page that is *already* not being served, so it does not
 * block. Every other assertion here would pass if such a page were silently dropped from both.
 */

const node = (over: Partial<ReadablePageNode> = {}): ReadablePageNode => ({
  component: 'Hero',
  type: 'dynamic',
  uid: 'component-1',
  publicationId: 'publication-1',
  data: {},
  ...over
} as ReadablePageNode)

/** Page name to the tree stored for it. `null` means published-but-empty is impossible; see below. */
let trees: Record<string, ReadablePageNode | null>
/** Pages whose stored tree does not verify. `getReadablePageTree` throws for these. */
let unverifiable: Set<string>

vi.mock('./io.server', () => ({
  pageReadableTreePath: '.genoacms/pages/readables',
  getReadablePageTree: async (name: string) => {
    if (unverifiable.has(name)) throw new Error(`pages/tree-unverifiable: ${name}`)
    return trees[name] ?? null
  }
}))

vi.mock('$lib/script/storage/storage.server', () => ({
  defaultBucketId: 'bucket',
  fullyQualifiedNameToFilename: (name: string) => name.split('/').pop() as string,
  listOrCreateDirectory: async ({ name }: { name: string }) => {
    listedAs = name
    return { files: Object.keys(trees).map(page => ({ name: `.genoacms/pages/readables/${page}` })) }
  }
}))

/** Captured so the trailing slash can be asserted — see the test that does. */
let listedAs = ''

const { listPagesPinning, requireNoPublishedDependents, ComponentInUseError, isComponentInUse } =
  await import('./dependents.server')

beforeEach(() => {
  unverifiable = new Set()
  listedAs = ''
  trees = {
    home: node({ data: { body: [node({ uid: 'component-2' })] } as never }),
    about: node({ uid: 'component-9' }),
    unpublished: null
  }
})

describe('finding the pages a deletion would break', () => {
  it('names a page that pins the component', async () => {
    const { pages } = await listPagesPinning('component-1')

    expect(pages.map(page => page.name)).toEqual(['home'])
  })

  it('says nothing about a page that pins a different component', async () => {
    const { pages } = await listPagesPinning('component-9')

    expect(pages.map(page => page.name)).toEqual(['about'])
  })

  it('counts every node that pins it, not every page', async () => {
    // One component may be placed in a page more than once, and an author deciding whether to delete
    // is better served by how much of the page goes than by how many pages are touched.
    trees.home = node({ data: { body: [node(), node()] } as never })

    const { pages } = await listPagesPinning('component-1')

    expect(pages[0]).toEqual({ name: 'home', nodes: 3 })
  })

  it('finds a pin nested deep inside a slot', async () => {
    // The pin that matters is rarely the root's. A scan that read only the top node would report
    // nothing for most real pages and would look like it worked.
    trees.home = node({
      uid: 'component-9',
      data: { body: [node({ uid: 'component-8', data: { body: [node()] } as never })] } as never
    })

    const { pages } = await listPagesPinning('component-1')

    expect(pages).toEqual([{ name: 'home', nodes: 1 }])
  })

  it('does not mistake a list of URLs for nested nodes', async () => {
    trees.home = node({ data: { links: ['https://example.com'], body: [node()] } as never })

    expect((await listPagesPinning('component-1')).pages).toEqual([{ name: 'home', nodes: 2 }])
  })

  it('ignores a page that was never published', async () => {
    // It has no tree, so it is serving nothing that could break.
    const { pages } = await listPagesPinning('component-1')

    expect(pages.map(page => page.name)).not.toContain('unpublished')
  })

  it('matches on the uid rather than the name', async () => {
    // A name is a label an author may reuse or change. Matching on it would warn about a different
    // component that happens to share one, and miss this one published under an old one.
    trees.home = node({ component: 'Renamed', uid: 'component-1' })
    trees.about = node({ component: 'Hero', uid: 'component-7' })

    expect((await listPagesPinning('component-1')).pages.map(page => page.name)).toEqual(['home'])
  })

  it('reports nothing for a component no page uses', async () => {
    expect(await listPagesPinning('component-never-used')).toEqual({ pages: [], unreadable: [] })
  })
})

describe('a page that cannot be answered for', () => {
  it('is reported rather than skipped', async () => {
    // **The case the file exists for.** A tree that does not verify is not a page depending on
    // nothing; it is a page nobody can say anything about, and silently omitting it would tell an
    // author the deletion is safe on the strength of a document that could not be read.
    unverifiable.add('about')

    const { unreadable } = await listPagesPinning('component-1')

    expect(unreadable).toEqual(['about'])
  })

  it('does not stop the scan', async () => {
    // One page in that state must not cost the answer about all the others.
    unverifiable.add('about')

    const { pages } = await listPagesPinning('component-1')

    expect(pages.map(page => page.name)).toEqual(['home'])
  })

  it('is kept out of the pages that definitely pin it', async () => {
    unverifiable.add('home')

    const { pages, unreadable } = await listPagesPinning('component-1')

    expect(pages).toEqual([])
    expect(unreadable).toEqual(['home'])
  })
})

describe('listing the published pages', () => {
  it('asks storage for a directory, with the trailing slash that makes it one', async () => {
    // Without it the listing comes back empty rather than failing, and an empty listing here reads
    // as "no page depends on this component" — the one answer this must never invent.
    await listPagesPinning('component-1')

    expect(listedAs.endsWith('/')).toBe(true)
  })
})

describe('refusing to break a published page', () => {
  /*
   * **R6 accepted the break; using the CMS showed why that was wrong.** A warning belongs to a
   * surface, and four things delete a component — two dialogs and two bulk selections. The one
   * without a warning is the one that silently breaks a site, so the rule moved below all four.
   */

  it('refuses a component a published page is built on', async () => {
    await expect(requireNoPublishedDependents('component-1'))
      .rejects.toBeInstanceOf(ComponentInUseError)
  })

  it('names the pages, so an author knows what to go and change', async () => {
    // "This component is in use" is not something anyone can act on.
    await expect(requireNoPublishedDependents('component-1')).rejects.toThrow(/home/)
  })

  it('permits a component no published page uses', async () => {
    await expect(requireNoPublishedDependents('component-never-used')).resolves.toBeUndefined()
  })

  it('permits a component only an unpublished page uses', async () => {
    // A draft naming it is not being served, so nothing breaks. The page editor is what stops such a
    // page being built afterwards.
    trees.unpublished = null

    await expect(requireNoPublishedDependents('component-never-used')).resolves.toBeUndefined()
  })

  it('does not block on a page whose tree cannot be read', async () => {
    /*
     * **Deliberate, and the opposite of what the confirmation does.** A tree that fails verification
     * is already not being served — this CMS refuses to return it and a consumer refuses to render
     * it — so a component it pins is not holding up a working page. Blocking would let one corrupt
     * document freeze component deletion across the instance, with no way out but deleting pages
     * blind. The dialog still shows it, because uncertainty is worth seeing and is not worth
     * stopping someone with.
     */
    trees.orphan = node({ uid: 'component-never-used' })
    unverifiable.add('orphan')

    await expect(requireNoPublishedDependents('component-never-used')).resolves.toBeUndefined()
  })
})

describe('recognizing the refusal at a route', () => {
  /*
   * **By name, not by `instanceof`.** A route and a library reached through different module graphs
   * can hold different copies of one class, and `instanceof` then answers `false` for the very error
   * it was written to catch — silently, and reading as an unrelated server error. That is not
   * hypothetical: the first version of this used `instanceof`, the refusal reached the browser as a
   * 500, and the end-to-end test that expected a reported refusal found no message at all.
   */

  it('recognizes the refusal', async () => {
    const raised = await requireNoPublishedDependents('component-1').catch(error => error)

    expect(isComponentInUse(raised)).toBe(true)
  })

  it('recognizes a copy of the class from another module graph', () => {
    // What `instanceof` cannot do, expressed as the thing that broke: an error carrying the same
    // name from a separately loaded copy of this module.
    const fromElsewhere = Object.assign(new Error('components/in-use: …'), {
      name: 'ComponentInUseError'
    })

    expect(isComponentInUse(fromElsewhere)).toBe(true)
  })

  it('does not swallow an unrelated failure', () => {
    // A storage outage must reach the route as an error rather than as a polite refusal, or a
    // deletion that never happened would be reported as one the author can fix by editing pages.
    expect(isComponentInUse(new Error('storage unreachable'))).toBe(false)
    expect(isComponentInUse('components/in-use')).toBe(false)
    expect(isComponentInUse(undefined)).toBe(false)
  })

  it('is what the class it names actually produces', () => {
    // Guards against the name drifting away from the class it is meant to match.
    expect(isComponentInUse(new ComponentInUseError([{ name: 'home', nodes: 1 }]))).toBe(true)
  })
})
