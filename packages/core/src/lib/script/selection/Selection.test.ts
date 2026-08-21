import { describe, it, expect } from 'vitest'
import { Selection } from './Selection.svelte'

/**
 * The selection core, shared by the storage browser, the collection list and the catalogue lists.
 *
 * Four surfaces depend on this, so its rules are asserted here rather than through any one of them.
 */

const file = (name: string) => ({ bucket: 'media', name })

describe('membership', () => {
  it('toggles, keyed by the item rather than by identity', () => {
    // References are rebuilt on every render, so two equal objects must be the same selection.
    const selection = new Selection<{ bucket: string, name: string }>()
    selection.toggle(file('a.txt'))

    expect(selection.isSelected({ bucket: 'media', name: 'a.txt' })).toBe(true)

    selection.toggle({ bucket: 'media', name: 'a.txt' })
    expect(selection.isSelected(file('a.txt'))).toBe(false)
  })

  it('takes a custom key when JSON is not the identity', () => {
    const selection = new Selection<{ id: string, name: string }>({ key: entry => entry.id })
    selection.toggle({ id: '1', name: 'first' })

    // The name differs, so JSON would call these different items. The id says otherwise.
    expect(selection.isSelected({ id: '1', name: 'changed' })).toBe(true)
  })

  it('preserves the order things were selected in', () => {
    const selection = new Selection<string>()
    selection.selectAll(['c', 'a', 'b'])

    expect(selection.value).toEqual(['c', 'a', 'b'])
  })

  it('empties completely', () => {
    const selection = new Selection<string>()
    selection.selectAll(['a', 'b'])
    selection.clear()

    expect(selection.isEmpty).toBe(true)
    expect(selection.value).toEqual([])
  })
})

describe('the item cap', () => {
  it('stops accepting more once reached', () => {
    const selection = new Selection<string>({ maxItems: 2 })
    selection.selectAll(['a', 'b', 'c'])

    expect(selection.value).toEqual(['a', 'b'])
  })

  it('still allows deselecting at the cap', () => {
    // The defect this core removes. The storage selection tested the cap *before* the toggle, so a
    // full selection could not be undone: every checkbox stopped responding at exactly the moment
    // the user needed to clear one.
    const selection = new Selection<string>({ maxItems: 1 })
    selection.toggle('a')
    expect(selection.canSelectMore).toBe(false)

    selection.toggle('a')
    expect(selection.isEmpty).toBe(true)
  })

  it('treats zero as no limit', () => {
    const selection = new Selection<string>({ maxItems: 0 })
    selection.selectAll(['a', 'b', 'c', 'd'])

    expect(selection.size).toBe(4)
  })

  it('can be capped after construction, for a picker told its limit on open', () => {
    const selection = new Selection<string>()
    selection.setMaxItems(1)
    selection.selectAll(['a', 'b'])

    expect(selection.value).toEqual(['a'])
  })
})

describe('refusing an item outright', () => {
  const filesOnly = () => new Selection<{ bucket: string, name: string }>({
    canSelect: reference => !reference.name.endsWith('/')
  })

  it('never selects what the surface excludes', () => {
    const selection = filesOnly()
    selection.toggle(file('folder/'))

    expect(selection.isEmpty).toBe(true)
  })

  it('leaves everything else alone', () => {
    const selection = filesOnly()
    selection.selectAll([file('a.txt'), file('folder/'), file('b.txt')])

    expect(selection.value.map(reference => reference.name)).toEqual(['a.txt', 'b.txt'])
  })
})

describe('seeding from a default', () => {
  it('loads what a picker was opened with', () => {
    const selection = new Selection<string>()
    selection.load(['a', 'b'])

    expect(selection.value).toEqual(['a', 'b'])
  })

  it('does nothing when there is no default', () => {
    const selection = new Selection<string>()
    selection.load(undefined)

    expect(selection.isEmpty).toBe(true)
  })

  it('does not duplicate what is already selected', () => {
    const selection = new Selection<string>()
    selection.toggle('a')
    selection.load(['a', 'b'])

    expect(selection.value).toEqual(['a', 'b'])
  })
})
