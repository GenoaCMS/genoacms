import { describe, it, expect } from 'vitest'
import { NamedSelection, confirmationPhrase, matchesConfirmation } from './NamedSelection.svelte'

/**
 * The selection behind bulk deletion, and the phrase that confirms it.
 *
 * The confirmation is the only thing standing between a stray click and several entries at once, so
 * what it accepts is worth asserting directly rather than through a browser.
 */

const entry = (name: string) => ({ id: `${name}-uid`, name })

describe('selecting', () => {
  it('toggles, so a second click deselects', () => {
    const selection = new NamedSelection()
    selection.toggle(entry('a'))
    expect(selection.isSelected('a-uid')).toBe(true)

    selection.toggle(entry('a'))
    expect(selection.isSelected('a-uid')).toBe(false)
  })

  it('keeps the order things were selected in', () => {
    // The confirmation asks for the names in the order they are shown, so a selection that
    // reordered them would produce a phrase nobody could type.
    const selection = new NamedSelection()
    selection.selectAll([entry('c'), entry('a'), entry('b')])

    expect(selection.names).toEqual(['c', 'a', 'b'])
  })

  it('does not duplicate an entry selected twice through selectAll', () => {
    const selection = new NamedSelection()
    selection.selectAll([entry('a'), entry('b')])
    selection.selectAll([entry('b')])

    expect(selection.names).toEqual(['a', 'b'])
  })

  it('reports ids for the server and names for the person', () => {
    const selection = new NamedSelection()
    selection.selectAll([entry('a')])

    expect(selection.ids).toEqual(['a-uid'])
    expect(selection.names).toEqual(['a'])
  })

  it('empties completely, so a later selection cannot inherit anything', () => {
    const selection = new NamedSelection()
    selection.selectAll([entry('a'), entry('b')])
    selection.clear()

    expect(selection.isEmpty).toBe(true)
    expect(selection.value).toEqual([])
  })
})

describe('the confirmation phrase', () => {
  it('is every name, in order', () => {
    expect(confirmationPhrase(['a', 'b', 'c'])).toBe('a, b, c')
  })

  it('accepts the phrase as shown', () => {
    expect(matchesConfirmation('a, b, c', ['a', 'b', 'c'])).toBe(true)
  })

  it('forgives spacing, because the names are the point and not the typing', () => {
    expect(matchesConfirmation('a,b,   c', ['a', 'b', 'c'])).toBe(true)
    expect(matchesConfirmation('  a, b, c  ', ['a', 'b', 'c'])).toBe(true)
  })

  it('refuses a different order', () => {
    // Order carries information: it is what the list showed, so typing it back proves the list was
    // read rather than the phrase guessed from one name.
    expect(matchesConfirmation('c, b, a', ['a', 'b', 'c'])).toBe(false)
  })

  it('refuses a missing name, which is the mistake worth catching', () => {
    expect(matchesConfirmation('a, b', ['a', 'b', 'c'])).toBe(false)
  })

  it('refuses an extra name', () => {
    expect(matchesConfirmation('a, b, c, d', ['a', 'b', 'c'])).toBe(false)
  })

  it('refuses nothing at all', () => {
    expect(matchesConfirmation('', ['a'])).toBe(false)
  })
})
