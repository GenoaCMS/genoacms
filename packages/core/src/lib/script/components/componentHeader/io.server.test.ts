import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stringify as stringifyFlatted, parse as parseFlatted } from 'flatted'
import type { ComponentHeader } from './component/types'

/**
 * Storing a component's header as two objects.
 *
 * A component's description is published and signed, so it is stored as plain JSON on its own. Its
 * editing history is stored beside it, flatted, and is nobody's business but the editor's. These
 * assert the consequences of that split — chiefly that a directory now holding two files per
 * component still lists one component.
 *
 * Only storage is stood in for — and it **throws** on a missing object, because that is what real
 * storage does. An earlier version of this mock returned `undefined` instead, every test passed, and
 * the application answered 500 on the components list.
 *
 * Nothing here covers an older storage shape, because nothing reads one: a header stored under the
 * previous directory, or in the single flatted form, or without an attribute order, is absent as far
 * as this module is concerned and the component has to be created again.
 */

const objects = new Map<string, string>()

vi.mock('$lib/script/storage/storage.server', () => ({
  defaultBucketId: 'default',
  // Filters by the directory asked for, because real storage does — otherwise a listing scoped to
  // one directory is indistinguishable from one that reads the whole bucket.
  listOrCreateDirectory: async ({ name }: { name: string }) => ({
    files: [...objects.keys()].filter(path => path.startsWith(name)).map(name => ({ name })),
    directories: []
  }),
  fullyQualifiedNameToFilename: (name: string) => name.split('/').at(-1) ?? name,
  uploadInternalObjectJSON: async (path: string, data: unknown) => {
    objects.set(path, JSON.stringify(data))
  },
  uploadInternalObjectFlatted: async (path: string, data: unknown) => {
    objects.set(path, stringifyFlatted(data))
  },
  getInternalObjectJSON: async (path: string) => {
    const stored = objects.get(path)
    if (stored === undefined) throw new Error(`No such object: ${path}`)
    return JSON.parse(stored)
  },
  getInternalObjectFlatted: async (path: string) => {
    const stored = objects.get(path)
    if (stored === undefined) throw new Error(`No such object: ${path}`)
    return parseFlatted(stored)
  },
  deleteInternalObject: async (path: string) => {
    if (!objects.has(path)) throw new Error(`No such object: ${path}`)
    objects.delete(path)
  }
}))

const {
  getComponentHeader,
  getComponentHeaderHistory,
  uploadComponentHeader,
  uploadComponentHeaderHistory,
  deleteComponentHeader,
  listOrCreateComponentHeaderList
} = await import('./io.server')

const PREFIX = '.genoacms/components/headers'

const entry = (uid: string): ComponentHeader => ({
  uid,
  type: 'prebuilt',
  name: 'Card',
  attributes: {},
  attributeOrder: []
})

beforeEach(() => { objects.clear() })

describe('storing the description', () => {
  it('writes it as plain JSON, which is what makes it publishable', async () => {
    // A format only this CMS can read would make the published header unverifiable outside it.
    await uploadComponentHeader(entry('c1'))

    expect(JSON.parse(objects.get(`${PREFIX}/c1.json`) as string)).toMatchObject({ uid: 'c1' })
  })

  it('reads back what was written', async () => {
    await uploadComponentHeader(entry('c1'))

    expect(await getComponentHeader('c1')).toMatchObject({ uid: 'c1', name: 'Card' })
  })

  it('reports a component that was never stored as absent', async () => {
    expect(await getComponentHeader('missing')).toBeNull()
  })
})

describe('storing the history beside it', () => {
  it('keeps the history out of the description', async () => {
    // The whole point of the split: a header that carried its history would publish every
    // intermediate state of an author's afternoon.
    await uploadComponentHeader(entry('c1'))
    await uploadComponentHeaderHistory('c1', { history: [[]], future: [] })

    expect(objects.get(`${PREFIX}/c1.json`)).not.toContain('history')
  })

  it('reads an absent history as an empty one rather than failing', async () => {
    expect(await getComponentHeaderHistory('c1')).toEqual({ history: [], future: [] })
  })

  it('starts a new history rather than failing on an unreadable one', async () => {
    // The description is intact either way, and the worst outcome is that the author cannot undo
    // past this point — which is not worth refusing the edit over.
    objects.set(`${PREFIX}/c1.history`, stringifyFlatted({ history: 'not an array' }))

    expect(await getComponentHeaderHistory('c1')).toEqual({ history: [], future: [] })
  })
})

describe('listing components', () => {
  it('lists one component per component, not one per stored file', async () => {
    // The directory now holds two files each. Treating every filename as a reference would report
    // every component twice — once as itself, once as its own history.
    await uploadComponentHeader(entry('c1'))
    await uploadComponentHeaderHistory('c1', { history: [], future: [] })
    await uploadComponentHeader(entry('c2'))
    await uploadComponentHeaderHistory('c2', { history: [], future: [] })

    const listed = await listOrCreateComponentHeaderList()

    expect(listed.map(component => component.uid).sort()).toEqual(['c1', 'c2'])
  })

  it('does not read a history file as though it were a component', async () => {
    // Counting the result is not enough to show this. A history read as a header fails the schema
    // and is dropped, so the count comes out right while every listing still does an extra storage
    // read. Asserting silence is what distinguishes "filtered" from "never looked at".
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await uploadComponentHeader(entry('c1'))
    await uploadComponentHeaderHistory('c1', { history: [], future: [] })

    await listOrCreateComponentHeaderList()

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('deleting a component', () => {
  it('removes a component that was never edited, which has no history object', async () => {
    // Storage raises on removing an object that is not there. Requiring the history to exist made
    // deleting a freshly created component answer 500 instead of redirecting.
    await uploadComponentHeader(entry('c1'))

    await expect(deleteComponentHeader('c1')).resolves.not.toThrow()
    expect([...objects.keys()]).toEqual([])
  })

  it('removes its history too, so nothing unreachable is left in the bucket', async () => {
    await uploadComponentHeader(entry('c1'))
    await uploadComponentHeaderHistory('c1', { history: [], future: [] })

    await deleteComponentHeader('c1')

    expect([...objects.keys()]).toEqual([])
  })
})
