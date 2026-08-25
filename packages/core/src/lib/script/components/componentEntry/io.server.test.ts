import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stringify as stringifyFlatted, parse as parseFlatted } from 'flatted'
import type { ComponentEntry } from './component/types'

/**
 * Storing a prebuilt component as two objects.
 *
 * A component's description is published and signed, so it is stored as plain JSON on its own. Its
 * editing history is stored beside it, flatted, and is nobody's business but the editor's. These
 * assert the consequences of that split — chiefly that a directory now holding two files per
 * component still lists one component.
 *
 * Only storage is stood in for — and it **throws** on a missing object, because that is what real
 * storage does. An earlier version of this mock returned `undefined` instead, every test passed, and
 * the application answered 500 on the components list: every component predating the split is stored
 * at the old path, so reading the new one throws before the fallback is reached.
 */

const objects = new Map<string, string>()

vi.mock('$lib/script/storage/storage.server', () => ({
  defaultBucketId: 'default',
  listOrCreateDirectory: async () => ({
    files: [...objects.keys()].map(name => ({ name })),
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
  getComponentEntry,
  getComponentEntryHistory,
  uploadComponentEntry,
  uploadComponentEntryHistory,
  deleteComponentEntry,
  listOrCreateComponentEntryList
} = await import('./io.server')

const PREFIX = '.genoacms/components/prebuilt'

const entry = (uid: string): ComponentEntry => ({
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
    await uploadComponentEntry(entry('c1'))

    expect(JSON.parse(objects.get(`${PREFIX}/c1.json`) as string)).toMatchObject({ uid: 'c1' })
  })

  it('reads back what was written', async () => {
    await uploadComponentEntry(entry('c1'))

    expect(await getComponentEntry('c1')).toMatchObject({ uid: 'c1', name: 'Card' })
  })

  it('reports a component that was never stored as absent', async () => {
    expect(await getComponentEntry('missing')).toBeNull()
  })
})

describe('storing the history beside it', () => {
  it('keeps the history out of the description', async () => {
    // The whole point of the split: an entry that carried its history would publish every
    // intermediate state of an author's afternoon.
    await uploadComponentEntry(entry('c1'))
    await uploadComponentEntryHistory('c1', { history: [[]], future: [] })

    expect(objects.get(`${PREFIX}/c1.json`)).not.toContain('history')
  })

  it('reads an absent history as an empty one rather than failing', async () => {
    expect(await getComponentEntryHistory('c1')).toEqual({ history: [], future: [] })
  })

  it('starts a new history rather than failing on an unreadable one', async () => {
    // The description is intact either way, and the worst outcome is that the author cannot undo
    // past this point — which is not worth refusing the edit over.
    objects.set(`${PREFIX}/c1.history`, stringifyFlatted({ history: 'not an array' }))

    expect(await getComponentEntryHistory('c1')).toEqual({ history: [], future: [] })
  })
})

describe('listing components', () => {
  it('lists one component per component, not one per stored file', async () => {
    // The directory now holds two files each. Treating every filename as a reference would report
    // every component twice — once as itself, once as its own history.
    await uploadComponentEntry(entry('c1'))
    await uploadComponentEntryHistory('c1', { history: [], future: [] })
    await uploadComponentEntry(entry('c2'))
    await uploadComponentEntryHistory('c2', { history: [], future: [] })

    const listed = await listOrCreateComponentEntryList()

    expect(listed.map(component => component.uid).sort()).toEqual(['c1', 'c2'])
  })

  it('does not read a history file as though it were a component', async () => {
    // Counting the result is not enough to show this. A history read as an entry fails the schema
    // and is dropped, so the count comes out right while every listing does an extra storage read
    // and warns about a component that was never stored the old way. Asserting silence is what
    // distinguishes "filtered" from "never looked at".
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await uploadComponentEntry(entry('c1'))
    await uploadComponentEntryHistory('c1', { history: [], future: [] })

    await listOrCreateComponentEntryList()

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('components stored before the split', () => {
  it('reads the description out of the old single flatted object', async () => {
    objects.set(`${PREFIX}/c1`, stringifyFlatted({ ...entry('c1'), history: [], future: [] }))

    expect(await getComponentEntry('c1')).toMatchObject({ uid: 'c1', name: 'Card' })
  })

  it('drops the inline history rather than carrying it into the description', async () => {
    // It has to be removed rather than ignored: the schema refuses an entry carrying it, so a
    // component stored the old way would otherwise read back as invalid and vanish from the list.
    objects.set(`${PREFIX}/c1`, stringifyFlatted({ ...entry('c1'), history: [], future: [] }))

    expect(await getComponentEntry('c1')).not.toHaveProperty('history')
  })

  it('prefers the new object once one has been written', async () => {
    objects.set(`${PREFIX}/c1`, stringifyFlatted({ ...entry('c1'), name: 'Stale', history: [], future: [] }))
    await uploadComponentEntry({ ...entry('c1'), name: 'Current' })

    expect(await getComponentEntry('c1')).toMatchObject({ name: 'Current' })
  })
})

describe('deleting a component', () => {
  it('removes a component that was never edited, which has no history object', async () => {
    // Storage raises on removing an object that is not there. Requiring the history to exist made
    // deleting a freshly created component answer 500 instead of redirecting.
    await uploadComponentEntry(entry('c1'))

    await expect(deleteComponentEntry('c1')).resolves.not.toThrow()
    expect([...objects.keys()]).toEqual([])
  })

  it('removes a component still stored in the old single-object form', async () => {
    // It has no `.json` and no history, so a delete that requires either cannot remove it at all.
    objects.set(`${PREFIX}/c1`, stringifyFlatted({ ...entry('c1'), history: [], future: [] }))

    await deleteComponentEntry('c1')

    expect([...objects.keys()]).toEqual([])
  })

  it('removes its history too, so nothing unreachable is left in the bucket', async () => {
    await uploadComponentEntry(entry('c1'))
    await uploadComponentEntryHistory('c1', { history: [], future: [] })

    await deleteComponentEntry('c1')

    expect([...objects.keys()]).toEqual([])
  })
})
