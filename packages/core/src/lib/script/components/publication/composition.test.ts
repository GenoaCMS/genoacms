import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Which components a page may be composed from.
 *
 * **R3.** A page is built against a component's shape, and a shape nobody has published is one no
 * consumer can verify — so a page composed from it names a publication that does not exist. The
 * refusal belongs where the choice is made rather than where the page is rendered.
 *
 * Its own file rather than a block inside `index.test.ts`, because the two need opposite stubs: that
 * file publishes **one** component and stands in a single publication record for it, while this one
 * needs a catalog whose members differ in whether they have been published at all.
 *
 * The case that carries the file is the **mixed** one. A test over a fully published catalog passes
 * whether the filter is applied or deleted, and so does one over a fully unpublished catalog — only
 * a catalog holding both can tell the two apart.
 */

const catalog = [
  { uid: 'published-prebuilt', type: 'prebuilt', name: 'Card' },
  { uid: 'never-published', type: 'dynamic', name: 'Draft' },
  { uid: 'published-dynamic', type: 'dynamic', name: 'Hero' }
]

let publishedUids = new Set<string>()

vi.mock('../componentHeader/io.server', () => ({
  getComponentHeader: async (uid: string) => catalog.find(header => header.uid === uid) ?? null,
  listOrCreateComponentHeaderList: async () => catalog
}))

vi.mock('./io.server', () => ({
  uploadPublishedHeader: async () => {},
  uploadPublishedExecutable: async () => {},
  uploadPublishedComponent: async () => {},
  deleteComponentPublications: async () => {},
  getPublishedComponent: async (uid: string) =>
    publishedUids.has(uid) ? { uid, publicationId: `publication-${uid}` } : null,
  listPublishedComponentUids: async () => {
    listings++
    return publishedUids
  }
}))

/** Counted, because the whole point of the listing is that it replaces a read per component. */
let listings = 0

const { listComposableComponentHeaders } = await import('./index')

const namesOf = async (): Promise<string[]> =>
  (await listComposableComponentHeaders()).map(header => header.uid)

beforeEach(() => {
  publishedUids = new Set(['published-prebuilt', 'published-dynamic'])
  listings = 0
})

describe('listing what a page may be composed from', () => {
  it('offers a component that has been published', async () => {
    expect(await namesOf()).toContain('published-dynamic')
  })

  it('withholds a component that has never been published', async () => {
    expect(await namesOf()).not.toContain('never-published')
  })

  it('does not dispatch on the kind', async () => {
    // Both kinds publish, so both compose. A filter that let prebuilt components through unpublished
    // would be the old behavior wearing R3's name, and every other assertion here would still pass.
    expect(await namesOf()).toEqual(['published-prebuilt', 'published-dynamic'])
  })

  it('keeps the catalog order', async () => {
    // The picker renders them in the order given, so reordering here reorders what an author sees.
    publishedUids.add('never-published')

    expect(await namesOf()).toEqual(['published-prebuilt', 'never-published', 'published-dynamic'])
  })

  it('offers nothing when nothing has been published', async () => {
    // The ordinary state of a fresh instance, and what the editor states rather than showing blank.
    publishedUids.clear()

    expect(await namesOf()).toEqual([])
  })

  it('asks storage once, however large the catalog', async () => {
    // A read per component would grow with the catalog, on the path an author waits on every time
    // the page editor loads. One listing answers the whole question, because the pointer filenames
    // are the uids.
    await listComposableComponentHeaders()

    expect(listings).toBe(1)
  })

  it('returns headers, not publication records', async () => {
    // The picker needs the shape to build a node from, and the pointer record holds none. Reading
    // the publication directory instead would list what is published and not what it looks like.
    const [first] = await listComposableComponentHeaders()

    expect(first).toMatchObject({ uid: 'published-prebuilt', name: 'Card', type: 'prebuilt' })
  })
})
