import { describe, it, expect } from 'vitest'
import { isUnset, setConstraint } from './constraints'

/**
 * The rule every attribute editor writes through, tested without rendering one.
 *
 * What matters is not the value stored but whether the **key exists**: that is what the digest is
 * taken over, and what a second producer either matches or does not.
 */

describe('what counts as unset', () => {
  it.each([undefined, null, '', []])('treats %p as no constraint', value => {
    expect(isUnset(value)).toBe(true)
  })

  it.each([0, false, 'a', [1], { a: 1 }])('treats %p as a constraint', value => {
    // Zero and false are the ones worth naming: both are falsy and both are real
    // constraints. `minimum: 0` and `default: false` say something.
    expect(isUnset(value)).toBe(false)
  })
})

describe('setting a constraint', () => {
  it('writes a value that is set', () => {
    const schema: Record<string, unknown> = { type: 'number' }
    setConstraint(schema, 'minimum', 5)

    expect(schema.minimum).toBe(5)
  })

  it('removes the key rather than emptying it', () => {
    // The distinction the whole rule turns on: `'minimum' in schema` must become
    // false. Assigning undefined would leave it true and fail validation.
    const schema: Record<string, unknown> = { type: 'number', minimum: 5 }
    setConstraint(schema, 'minimum', undefined)

    expect('minimum' in schema).toBe(false)
    expect(Object.keys(schema)).toEqual(['type'])
  })

  it.each([null, '', []])('removes the key when given %p', value => {
    const schema: Record<string, unknown> = { type: 'string', pattern: '.*' }
    setConstraint(schema, 'pattern', value)

    expect('pattern' in schema).toBe(false)
  })

  it('keeps a constraint of zero', () => {
    const schema: Record<string, unknown> = { type: 'number' }
    setConstraint(schema, 'minimum', 0)

    expect(schema.minimum).toBe(0)
  })

  it('leaves an absent key absent', () => {
    const schema: Record<string, unknown> = { type: 'number' }
    setConstraint(schema, 'maximum', '')

    expect(Object.keys(schema)).toEqual(['type'])
  })
})
