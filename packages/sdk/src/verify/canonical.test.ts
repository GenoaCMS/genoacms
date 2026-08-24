import { describe, it, expect } from 'vitest'
import { canonicalize, digest, CanonicalizationError } from './canonical.js'

/**
 * Canonicalization, against the rules the specification singles out.
 *
 * Each case below is one the specification names, and several are ones it says a cross-language
 * implementer is most likely to get wrong. The conformance corpus checks the same properties against
 * digests the signer produced; these check them here, where a failure says which rule broke.
 */

const hex = (bytes: Uint8Array): string =>
  [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')

describe('the rules that matter', () => {
  it('sorts keys, not by insertion order', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it('sorts by UTF-16 code unit, not by locale', () => {
    // The rule most likely to be got wrong. A locale-aware sort puts `ä` beside `a`; JCS puts it
    // after `z`, because its code unit is higher.
    expect(canonicalize({ ä: 1, a: 2, z: 3 })).toBe('{"a":2,"z":3,"ä":1}')
  })

  it('sorts at every depth', () => {
    expect(canonicalize({ outer: { b: 1, a: 2 } })).toBe('{"outer":{"a":2,"b":1}}')
  })

  it('preserves array order, which carries meaning', () => {
    expect(canonicalize({ a: [3, 1, 2] })).toBe('{"a":[3,1,2]}')
  })

  it('emits no insignificant whitespace', () => {
    expect(canonicalize({ a: 1, b: [1, 2] })).toBe('{"a":1,"b":[1,2]}')
  })

  it('writes large numbers in ECMAScript exponent form', () => {
    expect(canonicalize({ n: 1e30 })).toBe('{"n":1e+30}')
  })

  it('drops the fraction from an integral double', () => {
    expect(canonicalize({ n: 1.0 })).toBe('{"n":1}')
  })

  it('normalizes negative zero', () => {
    expect(canonicalize({ n: -0 })).toBe('{"n":0}')
  })

  it('emits non-ASCII literally rather than escaped', () => {
    expect(canonicalize({ s: '€' })).toBe('{"s":"€"}')
  })
})

describe('omitted is not null', () => {
  it('gives an absent key and a null key different digests', () => {
    // The specification calls this the single most likely cause of a cross-language mismatch.
    expect(hex(digest({}))).not.toBe(hex(digest({ minimum: null })))
  })

  it('keeps a null exactly where it was written', () => {
    expect(canonicalize({ minimum: null })).toBe('{"minimum":null}')
  })
})

describe('values that cannot be signed', () => {
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY]
  ])('refuses %s rather than normalizing it', (_name, value) => {
    expect(() => canonicalize({ n: value })).toThrow(CanonicalizationError)
  })

  it('refuses an undefined member rather than dropping it', () => {
    // Dropping it would attest to a payload the caller never supplied.
    expect(() => canonicalize({ a: undefined } as never)).toThrow(CanonicalizationError)
  })
})

describe('the digest', () => {
  it('is 32 bytes', () => {
    expect(digest({ a: 1 })).toHaveLength(32)
  })

  it('is taken over the canonical bytes, so key order cannot change it', () => {
    expect(hex(digest({ b: 1, a: 2 }))).toBe(hex(digest({ a: 2, b: 1 })))
  })
})
