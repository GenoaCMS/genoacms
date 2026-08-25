import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ComponentEntry } from './component/types'
import type { UndoRedoAdjunct } from '$lib/script/undoRedo/types'

/**
 * Editing a prebuilt component, and stepping back through those edits.
 *
 * ## Why these exist
 *
 * The undo and redo buttons in the prebuilt editor were rendered from the day the editor was
 * written and were never connected to anything: the server actions were empty, no save recorded a
 * step, and the buttons were handed no history depth so they rendered permanently disabled. Nothing
 * failed, because nothing asserted any of it.
 *
 * The generic operations in `undoRedo` had tests and passed them throughout. That is precisely the
 * gap these close: a unit that works in isolation proves nothing about whether anything calls it.
 * What is asserted here is the *wiring* — that saving records a step, and that undo moves through
 * the steps that saving recorded.
 *
 * Only storage is stood in for.
 */

const entries = new Map<string, ComponentEntry>()
const histories = new Map<string, UndoRedoAdjunct<ComponentEntry>>()

vi.mock('./io.server', () => ({
  getComponentEntry: async (reference: string) =>
    structuredClone(entries.get(reference)) ?? null,
  getComponentEntryHistory: async (reference: string) =>
    structuredClone(histories.get(reference)) ?? { history: [], future: [] },
  uploadComponentEntry: async (entry: ComponentEntry) => {
    entries.set(entry.uid, structuredClone(entry))
  },
  uploadComponentEntryHistory: async (reference: string, adjunct: UndoRedoAdjunct<ComponentEntry>) => {
    histories.set(reference, structuredClone(adjunct))
  }
}))

const {
  saveComponentEntry,
  undoComponentEntry,
  redoComponentEntry,
  getComponentEntryDepth
} = await import('./editing.server')

const entry = (over: Partial<ComponentEntry> = {}): ComponentEntry => ({
  uid: 'c1',
  type: 'prebuilt',
  name: 'Card',
  attributes: {},
  attributeOrder: [],
  ...over
})

/** Puts a component in storage as though it had been created, with no history yet. */
const existing = async () => { await saveComponentEntry(entry()) }

beforeEach(() => {
  entries.clear()
  histories.clear()
})

describe('recording what an author did', () => {
  it('records a step when an existing component is changed', async () => {
    await existing()
    await saveComponentEntry(entry({ name: 'Renamed' }))

    expect((await getComponentEntryDepth('c1')).historyLength).toBe(1)
  })

  it('records nothing for the first save, which has no previous state', async () => {
    // Creation is not something undo reverses, and there is nothing to diff it against.
    await existing()

    expect((await getComponentEntryDepth('c1')).historyLength).toBe(0)
  })

  it('records nothing when a save changed nothing', async () => {
    await existing()
    await saveComponentEntry(entry())

    expect((await getComponentEntryDepth('c1')).historyLength).toBe(0)
  })

  it('diffs against storage rather than against whatever the caller supplied', async () => {
    // The recorded step is what an undo replays. A client that reported its own "before" could
    // report anything, and the history would then revert to a state that never existed.
    await existing()
    await saveComponentEntry(entry({ name: 'Renamed' }))
    await undoComponentEntry('c1')

    expect(entries.get('c1')?.name).toBe('Card')
  })
})

describe('stepping back and forward', () => {
  it('restores the previous state', async () => {
    await existing()
    await saveComponentEntry(entry({ name: 'Renamed' }))

    await undoComponentEntry('c1')

    expect(entries.get('c1')?.name).toBe('Card')
  })

  it('puts the change back', async () => {
    await existing()
    await saveComponentEntry(entry({ name: 'Renamed' }))

    await undoComponentEntry('c1')
    await redoComponentEntry('c1')

    expect(entries.get('c1')?.name).toBe('Renamed')
  })

  it('moves the step from history to future, so the buttons follow', async () => {
    await existing()
    await saveComponentEntry(entry({ name: 'Renamed' }))

    await undoComponentEntry('c1')

    expect(await getComponentEntryDepth('c1')).toEqual({ historyLength: 0, futureLength: 1 })
  })

  it('walks back through several edits in the order they were made', async () => {
    await existing()
    await saveComponentEntry(entry({ name: 'Second' }))
    await saveComponentEntry(entry({ name: 'Third' }))

    await undoComponentEntry('c1')
    expect(entries.get('c1')?.name).toBe('Second')

    await undoComponentEntry('c1')
    expect(entries.get('c1')?.name).toBe('Card')
  })

  it('restores an attribute that was added, not only a renamed field', async () => {
    await existing()
    await saveComponentEntry(entry({ attributeOrder: ['a1'] }))

    await undoComponentEntry('c1')

    expect(entries.get('c1')?.attributeOrder).toEqual([])
  })

  it('does nothing at the beginning of a history', async () => {
    await existing()

    await undoComponentEntry('c1')

    expect(entries.get('c1')?.name).toBe('Card')
    expect(await getComponentEntryDepth('c1')).toEqual({ historyLength: 0, futureLength: 0 })
  })

  it('reports a component that does not exist rather than failing', async () => {
    expect(await undoComponentEntry('missing')).toBeNull()
  })

  it('drops the redo branch once the author edits from an undone state', async () => {
    await existing()
    await saveComponentEntry(entry({ name: 'Second' }))
    await undoComponentEntry('c1')

    await saveComponentEntry(entry({ name: 'Elsewhere' }))

    expect((await getComponentEntryDepth('c1')).futureLength).toBe(0)
  })
})
