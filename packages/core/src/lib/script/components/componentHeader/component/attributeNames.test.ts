import { describe, it, expect } from 'vitest'
import {
  duplicateAttributeNames,
  requireDistinctAttributeNames,
  DuplicateAttributeNameError,
  isDuplicateAttributeName,
  requireUnreservedAttributeNames,
  ReservedAttributeNameError,
  isReservedAttributeName
} from './attributeNames'
import type { Attribute, ComponentHeader } from './types'

/**
 * An attribute's name is its identity in a published page.
 *
 * A published node's `data` is keyed by the name a person typed; a publication's `attributeOrder`
 * lists uids, which exist so a rename does not lose the value bound to an attribute mid-edit. A
 * consumer walks the order and looks each value up by name, so **the whole mapping of values onto a
 * component's parameters rests on a name naming one attribute**.
 *
 * What makes this worth refusing rather than reporting: when two collide, the second overwrites the
 * first as the tree is built, and the tree is signed *afterwards*. The page loses a value, the
 * component is called with another in its place, and every signature over the result is valid.
 * Nothing downstream can discover it.
 */

const attribute = (uid: string, title?: string): Attribute => ({
  uid,
  name: uid,
  type: 'string',
  schema: { type: 'string', ...(title === undefined ? {} : { title }) }
} as unknown as Attribute)

const headerWith = (...attributes: Attribute[]): ComponentHeader => ({
  uid: 'component-1',
  type: 'prebuilt',
  name: 'Hero',
  attributes: Object.fromEntries(attributes.map(one => [one.uid, one])),
  attributeOrder: attributes.map(one => one.uid)
})

describe('finding attributes that share a name', () => {
  it('reports a name two attributes carry', () => {
    const header = headerWith(attribute('a', 'Heading'), attribute('b', 'Heading'))

    expect(duplicateAttributeNames(header)).toEqual(['Heading'])
  })

  it('reports a repeated name once, however many carry it', () => {
    // An author renaming three attributes to one thing needs to be told which name is the problem,
    // not told the same thing three times.
    const header = headerWith(
      attribute('a', 'Heading'), attribute('b', 'Heading'), attribute('c', 'Heading')
    )

    expect(duplicateAttributeNames(header)).toEqual(['Heading'])
  })

  it('reports every colliding name, not the first one met', () => {
    const header = headerWith(
      attribute('a', 'Heading'), attribute('b', 'Heading'),
      attribute('c', 'Body'), attribute('d', 'Body')
    )

    expect(duplicateAttributeNames(header)).toEqual(['Heading', 'Body'])
  })

  it('says nothing about a component whose names are distinct', () => {
    const header = headerWith(attribute('a', 'Heading'), attribute('b', 'Body'))

    expect(duplicateAttributeNames(header)).toEqual([])
  })

  it('says nothing about a component with no attributes', () => {
    expect(duplicateAttributeNames(headerWith())).toEqual([])
  })

  it('does not compare the uid, which is distinct by construction', () => {
    // Two attributes always have different uids, so a check reading them could never fire and would
    // look like it was working.
    const header = headerWith(attribute('a', 'Heading'), attribute('b', 'Heading'))

    expect(duplicateAttributeNames(header)).not.toEqual([])
  })
})

describe('what counts as the same name', () => {
  it('treats names differing only at the ends as one', () => {
    // Different keys in storage, the same name to the person reading a list of them. Nobody should
    // have to tell "Body" from "Body " by eye.
    const header = headerWith(attribute('a', 'Body'), attribute('b', ' Body '))

    expect(duplicateAttributeNames(header)).toEqual(['Body'])
  })

  it('keeps names differing in case apart', () => {
    // Two names a person chose to write differently, which survive into two distinct parameters.
    const header = headerWith(attribute('a', 'Body'), attribute('b', 'body'))

    expect(duplicateAttributeNames(header)).toEqual([])
  })

  it('collides two attributes that have not been named yet', () => {
    // They key a published page identically, so the collision is real even though neither has a name
    // to report. The message describes the empty name rather than quoting nothing.
    const header = headerWith(attribute('a'), attribute('b'))

    expect(duplicateAttributeNames(header)).toEqual([''])
  })

  it('leaves a single unnamed attribute alone', () => {
    // An ordinary state halfway through describing a component. Refusing it would stop an author
    // saving between adding an attribute and naming it; the emitter is what refuses to publish one.
    const header = headerWith(attribute('a'), attribute('b', 'Body'))

    expect(duplicateAttributeNames(header)).toEqual([])
  })
})

describe('refusing the component', () => {
  it('refuses a header carrying a repeated name', () => {
    const header = headerWith(attribute('a', 'Heading'), attribute('b', 'Heading'))

    expect(() => requireDistinctAttributeNames(header)).toThrow(DuplicateAttributeNameError)
  })

  it('names the attributes, so an author knows which to rename', () => {
    const header = headerWith(attribute('a', 'Heading'), attribute('b', 'Heading'))

    expect(() => requireDistinctAttributeNames(header)).toThrow(/"Heading"/)
  })

  it('reads naturally when several names collide', () => {
    const header = headerWith(
      attribute('a', 'Heading'), attribute('b', 'Heading'),
      attribute('c', 'Body'), attribute('d', 'Body')
    )

    expect(() => requireDistinctAttributeNames(header))
      .toThrow(/"Heading" and "Body" are used by more than one attribute/)
  })

  it('describes an unnamed attribute rather than quoting an empty string', () => {
    const header = headerWith(attribute('a'), attribute('b'))

    expect(() => requireDistinctAttributeNames(header)).toThrow(/an empty name is/)
  })

  it('permits a header whose names are distinct', () => {
    const header = headerWith(attribute('a', 'Heading'), attribute('b', 'Body'))

    expect(() => requireDistinctAttributeNames(header)).not.toThrow()
  })
})

describe('recognizing the refusal at a route', () => {
  /*
   * **By name, not by `instanceof`.** A route and this module reached through different module graphs
   * hold different copies of one class, and `instanceof` then answers `false` for the error it was
   * written to catch — silently, reading as an unrelated server error. That is not hypothetical here:
   * it has happened twice in this codebase, and `dependents.server.ts` carries the same predicate.
   */

  it('recognizes what the class it names produces', () => {
    expect(isDuplicateAttributeName(new DuplicateAttributeNameError(['Heading']))).toBe(true)
  })

  it('recognizes a copy of the class from another module graph', () => {
    const fromElsewhere = Object.assign(new Error('components/duplicate-attribute-name: …'), {
      name: 'DuplicateAttributeNameError'
    })

    expect(isDuplicateAttributeName(fromElsewhere)).toBe(true)
  })

  it('does not swallow an unrelated failure', () => {
    // A storage outage must reach the route as an error rather than as a refusal the author is told
    // to fix by renaming something.
    expect(isDuplicateAttributeName(new Error('storage unreachable'))).toBe(false)
    expect(isDuplicateAttributeName('components/duplicate-attribute-name')).toBe(false)
    expect(isDuplicateAttributeName(undefined)).toBe(false)
  })
})

describe('a name the component already uses', () => {
  it('refuses an attribute called passthrough', () => {
    // Every component receives that parameter, so the attribute would become a second one of the
    // same name and the emitted signature would not compile.
    const header = headerWith(attribute('a', 'passthrough'))

    expect(() => requireUnreservedAttributeNames(header)).toThrow(ReservedAttributeNameError)
  })

  it('says what already uses the name rather than only that it is taken', () => {
    const header = headerWith(attribute('a', 'passthrough'))

    expect(() => requireUnreservedAttributeNames(header)).toThrow(/consuming application/)
  })

  it('trims the ends before deciding, as the emitter does', () => {
    const header = headerWith(attribute('a', ' passthrough '))

    expect(() => requireUnreservedAttributeNames(header)).toThrow(ReservedAttributeNameError)
  })

  it('allows a name differing only in case, which becomes a different parameter', () => {
    // Refusing it would cost an author a usable name for a collision that does not happen.
    const header = headerWith(attribute('a', 'Passthrough'))

    expect(() => requireUnreservedAttributeNames(header)).not.toThrow()
  })

  it('leaves ordinary names alone', () => {
    const header = headerWith(attribute('a', 'Heading'), attribute('b', 'Body'))

    expect(() => requireUnreservedAttributeNames(header)).not.toThrow()
  })

  it('is recognized across module graphs, by name rather than by instanceof', () => {
    const fromElsewhere = new Error('components/reserved-attribute-name: ...')
    fromElsewhere.name = 'ReservedAttributeNameError'

    expect(isReservedAttributeName(fromElsewhere)).toBe(true)
    expect(isReservedAttributeName(new Error('storage unreachable'))).toBe(false)
  })
})
