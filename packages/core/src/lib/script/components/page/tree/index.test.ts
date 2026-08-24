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
  'entry-prebuilt': { type: 'prebuilt' }
}
/**
 * Both entries have commits.
 *
 * The prebuilt one deliberately does too. Without it, "prebuilt components are not pinned" would
 * pass for the wrong reason — an empty history yields no pin either — and the test would not notice
 * a builder that pinned everything it could.
 */
const histories: Record<string, string[]> = {
  'entry-dynamic': ['commit-old', 'commit-new'],
  'entry-prebuilt': ['commit-prebuilt']
}

vi.mock('$lib/script/components/componentEntry/io.server', () => ({
  getComponentEntry: async (reference: string) => entries[reference] ?? null
}))

vi.mock('$lib/script/components/editor/io', () => ({
  getComponentDefiniton: async (reference: string) => ({ history: histories[reference] ?? [] })
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
  histories['entry-dynamic'] = ['commit-old', 'commit-new']
  histories['entry-prebuilt'] = ['commit-prebuilt']
})

describe('pinning a revision', () => {
  it('pins a dynamic node to the newest revision at build time', async () => {
    const tree = await pageEntryToReadableTree(pageWith('entry-dynamic'))

    expect(tree.commitId).toBe('commit-new')
  })

  it('names which component the revision belongs to', async () => {
    // An executable lives at `{uid}/{commitId}`, so a pin without the uid is one nobody can resolve.
    const tree = await pageEntryToReadableTree(pageWith('entry-dynamic'))

    expect(tree.uid).toBe('entry-dynamic')
  })

  it('carries uid and commitId together or not at all', async () => {
    const dynamic = await pageEntryToReadableTree(pageWith('entry-dynamic'))
    const prebuilt = await pageEntryToReadableTree(pageWith('entry-prebuilt'))

    expect([dynamic.uid !== undefined, dynamic.commitId !== undefined]).toEqual([true, true])
    expect([prebuilt.uid !== undefined, prebuilt.commitId !== undefined]).toEqual([false, false])
  })

  it('keeps the pin the page was built with, even after a newer commit exists', async () => {
    const before = await pageEntryToReadableTree(pageWith('entry-dynamic'))
    histories['entry-dynamic'] = ['commit-old', 'commit-new', 'commit-newer']

    // A tree already built is a published document; nothing rereads the history for it. Rebuilding
    // is what moves the pin, and rebuilding is what republishing means.
    expect(before.commitId).toBe('commit-new')
    expect((await pageEntryToReadableTree(pageWith('entry-dynamic'))).commitId).toBe('commit-newer')
  })

  it('gives a prebuilt node no revision at all, even where one could be read', async () => {
    // Its code is in the consuming application. There is nothing for the CMS to pin, and the
    // fixture gives it a commit history precisely so that reading one would show up here.
    const tree = await pageEntryToReadableTree(pageWith('entry-prebuilt'))

    expect('commitId' in tree).toBe(false)
    expect('uid' in tree).toBe(false)
  })

  it('omits the key rather than writing undefined', async () => {
    // The tree is signed. Canonicalization drops an undefined member silently, so an explicit
    // `commitId: undefined` would sign as though the key had never been written.
    const tree = await pageEntryToReadableTree(pageWith('entry-prebuilt'))

    expect(Object.keys(tree)).toEqual(['component', 'data'])
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
