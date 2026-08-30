import { describe, it, expect } from 'vitest'
import { GUARD_EXHAUSTED, GUARD_BUDGET_INVALID, GUARD_FAMILIES, isGuardExhausted } from './guards.js'

/** A trip as an adapter builds one: a plain error with the two fields that identify it. */
const trip = (guard) => Object.assign(new Error('exhausted'), { name: GUARD_EXHAUSTED, guard, limit: 10 })

describe('the guard families', () => {
  it('is exactly the three the design names', () => {
    // Spelled out rather than derived, so adding a family is a decision and not a typo.
    expect([...GUARD_FAMILIES]).toEqual(['fuel', 'depth', 'allocation'])
  })

  it('names the two failures apart', () => {
    expect(GUARD_EXHAUSTED).not.toBe(GUARD_BUDGET_INVALID)
  })
})

describe('recognizing a trip', () => {
  it.each([...GUARD_FAMILIES])('accepts a trip from the %s guard', (guard) => {
    expect(isGuardExhausted(trip(guard))).toBe(true)
  })

  it('accepts one built in another realm', () => {
    // The case `instanceof` gets wrong: a worker's Error is a different constructor.
    const foreign = { name: GUARD_EXHAUSTED, guard: 'fuel', limit: 10, message: 'exhausted' }

    expect(isGuardExhausted(foreign)).toBe(true)
  })

  it('refuses an ordinary component fault', () => {
    expect(isGuardExhausted(new TypeError('cannot read properties of undefined'))).toBe(false)
  })

  it('refuses an error wearing the name without a family', () => {
    // A component can throw whatever it likes, including this name.
    expect(isGuardExhausted(Object.assign(new Error('nice try'), { name: GUARD_EXHAUSTED }))).toBe(false)
  })

  it('refuses one naming a family that does not exist', () => {
    expect(isGuardExhausted(trip('network'))).toBe(false)
  })

  it.each([undefined, null, 'GuardExhausted', 42])('refuses %s', (value) => {
    expect(isGuardExhausted(value)).toBe(false)
  })
})
