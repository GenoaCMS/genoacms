import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PageEntry } from '../entry/types'

/**
 * Building the published tree from a page entry.
 *
 * Two properties, both of which were wrong before P3:
 *
 * - **A dynamic node names the revision it was published against.** Resolving the newest revision
 *   at render time would make every published page follow the latest commit, which is not a pin.
 * - **Links and storage resources are lists.** Their meta-schemas always said so and the editor
 *   always wrote arrays, but the builder cast the value to a single link — so `.isExternal` was read
 *   off an array, came back `undefined`, and every published link resolved to an empty URL.
 */

const entries: Record<string, { type: string } | null> = {
  'entry-dynamic': { type: 'dynamic' },
  'entry-prebuilt': { type: 'prebuilt' },
  'entry-unpublished': { type: 'dynamic' }
}
/**
 * What each component has last published, as the pointer record holds it.
 *
 * A third component is deliberately absent from this map: a component that has never been published
 * has no publication to pin, and that is the only case a node goes out unpinned now.
 */
const published: Record<string, string | undefined> = {
  'entry-dynamic': 'publication-new',
  'entry-prebuilt': 'publication-prebuilt'
}

vi.mock('$lib/script/components/componentHeader/io.server', () => ({
  getComponentHeader: async (reference: string) => entries[reference] ?? null
}))

vi.mock('$lib/script/components/publication/io.server', () => ({
  getPublishedComponent: async (reference: string) => {
    const publicationId = published[reference]
    return publicationId === undefined ? null : { uid: reference, publicationId }
  }
}))

vi.mock('$lib/script/storage/storage.server', () => ({
  getPublicURL: async ({ bucket, name }: { bucket: string, name: string }) =>
    `https://storage.example/${bucket}/${name}`
}))

vi.mock('$lib/script/components/page/page.server', () => ({
  getPageEntry: async (name: string) => ({ previewURL: `https://site.example/${name}` })
}))

const { pageEntryToReadableTree } = await import('./index')

const pageWith = (entryReference: string, data: Record<string, unknown> = {}): PageEntry => ({
  name: 'home',
  previewURL: '',
  contents: {
    rootNodeUid: 'node-1',
    nodes: {
      'node-1': { uid: 'node-1', entryReference, name: 'Hero', data }
    }
  },
  history: [],
  future: [],
  lastModified: ''
} as unknown as PageEntry)

const attribute = (type: string, value: unknown) => ({
  uid: 'a1', name: 'field', type, schema: undefined, value
})

beforeEach(() => {
  published['entry-dynamic'] = 'publication-new'
  published['entry-prebuilt'] = 'publication-prebuilt'
})

describe('pinning a publication', () => {
  it('pins a dynamic node to the newest publication at build time', async () => {
    const tree = await pageEntryToReadableTree(pageWith('entry-dynamic'))

    expect(tree.publicationId).toBe('publication-new')
  })

  it('names which component the publication belongs to', async () => {
    // A publication lives at `{uid}/{publicationId}`, so a pin without the uid is one nobody can resolve.
    const tree = await pageEntryToReadableTree(pageWith('entry-dynamic'))

    expect(tree.uid).toBe('entry-dynamic')
  })

  it('carries uid and publicationId together or not at all', async () => {
    const dynamic = await pageEntryToReadableTree(pageWith('entry-dynamic'))
    const unpublished = await pageEntryToReadableTree(pageWith('entry-unpublished'))

    expect([dynamic.uid !== undefined, dynamic.publicationId !== undefined]).toEqual([true, true])
    expect([unpublished.uid !== undefined, unpublished.publicationId !== undefined]).toEqual([false, false])
  })

  it('keeps the pin the page was built with, even after a newer publication exists', async () => {
    const before = await pageEntryToReadableTree(pageWith('entry-dynamic'))
    published['entry-dynamic'] = 'publication-newer'

    // A tree already built is a published document; nothing rereads the pointer for it. Rebuilding
    // is what moves the pin, and rebuilding is what republishing means.
    expect(before.publicationId).toBe('publication-new')
    expect((await pageEntryToReadableTree(pageWith('entry-dynamic'))).publicationId).toBe('publication-newer')
  })

  it('pins a prebuilt node too', async () => {
    // The half of R1 this step exists for. A prebuilt component's *code* is in the consuming
    // application, but its description is published and signed like any other — so it has a
    // publication, and a builder that still skipped it would leave the consumer calling the
    // component from an unsigned local assumption about its parameter order.
    const tree = await pageEntryToReadableTree(pageWith('entry-prebuilt'))

    expect(tree.publicationId).toBe('publication-prebuilt')
    expect(tree.uid).toBe('entry-prebuilt')
  })

  it('states the kind rather than leaving it to be inferred', async () => {
    // Both kinds are pinned now, so absence distinguishes nothing and the node has to say which it
    // is. It is what tells a consumer whether to expect code at the publication.
    const dynamic = await pageEntryToReadableTree(pageWith('entry-dynamic'))
    const prebuilt = await pageEntryToReadableTree(pageWith('entry-prebuilt'))

    expect(dynamic.type).toBe('dynamic')
    expect(prebuilt.type).toBe('prebuilt')
  })

  it('leaves a component that was never published unpinned, but still typed', async () => {
    const tree = await pageEntryToReadableTree(pageWith('entry-unpublished'))

    expect(tree.type).toBe('dynamic')
    expect('publicationId' in tree).toBe(false)
    expect('uid' in tree).toBe(false)
  })

  it('omits the key rather than writing undefined', async () => {
    // The tree is signed. Canonicalization drops an undefined member silently, so an explicit
    // `publicationId: undefined` would sign as though the key had never been written.
    const tree = await pageEntryToReadableTree(pageWith('entry-unpublished'))

    expect(Object.keys(tree)).toEqual(['component', 'type', 'data'])
  })

  it('carries no source code', async () => {
    const tree = await pageEntryToReadableTree(pageWith('entry-dynamic'))

    expect('componentCode' in tree).toBe(false)
  })
})

describe('resolving list-valued attributes', () => {
  it('resolves every link, in the order the author arranged them', async () => {
    const tree = await pageEntryToReadableTree(pageWith('entry-dynamic', {
      a1: attribute('link', [
        { isExternal: true, url: 'https://example.com' },
        { isExternal: false, pageName: 'about' }
      ])
    }))

    expect(tree.data.field).toEqual(['https://example.com', 'https://site.example/about'])
  })

  it('resolves an empty link list to an empty list', async () => {
    // What an author who filled nothing in leaves behind. It used to be a single blank link, which
    // resolved to a published link pointing at ''.
    const tree = await pageEntryToReadableTree(pageWith('entry-dynamic', {
      a1: attribute('link', [])
    }))

    expect(tree.data.field).toEqual([])
  })

  it('resolves every storage resource', async () => {
    const tree = await pageEntryToReadableTree(pageWith('entry-dynamic', {
      a1: attribute('storageResource', [
        { bucket: 'b', name: 'one.png' },
        { bucket: 'b', name: 'two.png' }
      ])
    }))

    expect(tree.data.field).toEqual([
      'https://storage.example/b/one.png',
      'https://storage.example/b/two.png'
    ])
  })
})
