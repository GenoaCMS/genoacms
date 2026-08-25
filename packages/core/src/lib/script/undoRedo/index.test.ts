import { describe, it, expect } from 'vitest'
import { noHistory, recordChange, undo, redo } from './index'
import type { UndoRedoAdjunct } from './types'

/**
 * Editing history on its own, tested on a shape that is neither a page nor a component.
 *
 * Using a plain object is the point: these operations were extracted from the page editor precisely
 * because nothing in them is about pages, and a test written against `PageContents` would not show
 * that.
 */

interface Doc { title: string, tags: string[] }

/** One edit, as a caller performs it: change the state, then record what changed. */
const edit = (doc: Doc, adjunct: UndoRedoAdjunct<Doc>, change: (doc: Doc) => void) => {
  const previous = structuredClone(doc)
  change(doc)
  return recordChange(doc, adjunct, previous)
}

describe('recording steps', () => {
  it('starts with nothing done and nothing to redo', () => {
    expect(noHistory<Doc>()).toEqual({ history: [], future: [] })
  })

  it('records a step and leaves the state as the author left it', () => {
    const doc: Doc = { title: 'first', tags: [] }
    const adjunct = edit(doc, noHistory<Doc>(), d => { d.title = 'second' })

    expect(doc.title).toBe('second')
    expect(adjunct.history).toHaveLength(1)
  })

  it('records nothing when nothing changed', () => {
    // An empty step still occupies a place in the history, so undoing would appear to do nothing
    // once for every save that changed nothing.
    const doc: Doc = { title: 'first', tags: [] }

    expect(edit(doc, noHistory<Doc>(), () => {}).history).toEqual([])
  })

  it('keeps one edit as one step, however many fields it touched', () => {
    // Grouping is what makes undo match the author's sense of an edit. Ungrouped, renaming and
    // retagging in one action would take two presses to undo, with nothing marking where the
    // author's own edit began.
    const doc: Doc = { title: 'first', tags: [] }
    const adjunct = edit(doc, noHistory<Doc>(), d => { d.title = 'second'; d.tags.push('new') })

    expect(adjunct.history).toHaveLength(1)
    expect(adjunct.history[0].length).toBeGreaterThan(1)

    undo(doc, adjunct)
    expect(doc).toEqual({ title: 'first', tags: [] })
  })
})

describe('undoing and redoing', () => {
  const twoEdits = () => {
    const doc: Doc = { title: 'a', tags: [] }
    const first = edit(doc, noHistory<Doc>(), d => { d.title = 'b' })
    return { doc, adjunct: edit(doc, first, d => { d.title = 'c' }) }
  }

  it('reverts the most recent step, not the oldest', () => {
    // History reads oldest-first, so taking the wrong end walks the author's edits backwards from
    // the start and leaves a state they never saw.
    const { doc, adjunct } = twoEdits()
    undo(doc, adjunct)

    expect(doc.title).toBe('b')
  })

  it('walks back to the beginning one step at a time', () => {
    const { doc, adjunct } = twoEdits()
    redo(doc, undo(doc, undo(doc, adjunct)))

    expect(doc.title).toBe('b')
  })

  it('applies what was undone, most recently undone first', () => {
    const { doc, adjunct } = twoEdits()
    const undone = undo(doc, undo(doc, adjunct))
    expect(doc.title).toBe('a')

    redo(doc, redo(doc, undone))
    expect(doc.title).toBe('c')
  })

  it('moves a step between history and future rather than dropping it', () => {
    const { doc, adjunct } = twoEdits()
    const undone = undo(doc, adjunct)

    expect(undone.history).toHaveLength(1)
    expect(undone.future).toHaveLength(1)
  })

  it('does nothing with an empty history, rather than failing', () => {
    const doc: Doc = { title: 'a', tags: [] }
    const empty = noHistory<Doc>()

    expect(undo(doc, empty)).toEqual(empty)
    expect(redo(doc, empty)).toEqual(empty)
    expect(doc.title).toBe('a')
  })

  it('discards the redo branch once the author edits from an undone state', () => {
    // The abandoned branch's differences were computed against a state that no longer exists, so
    // applying them would corrupt rather than restore.
    const { doc, adjunct } = twoEdits()
    const diverged = edit(doc, undo(doc, adjunct), d => { d.title = 'elsewhere' })

    expect(diverged.future).toEqual([])
    redo(doc, diverged)
    expect(doc.title).toBe('elsewhere')
  })

  it('restores a nested change, not only a top-level field', () => {
    const doc: Doc = { title: 'a', tags: ['x'] }
    const adjunct = edit(doc, noHistory<Doc>(), d => { d.tags.push('y') })

    undo(doc, adjunct)
    expect(doc.tags).toEqual(['x'])
  })
})
