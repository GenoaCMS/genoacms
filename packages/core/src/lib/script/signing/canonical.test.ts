import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { assertSignable, canonicalString, canonicalBytes, digest, type JsonValue } from './canonical'

const hex = (bytes: Uint8Array): string =>
  [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')

describe('RFC 8785 canonical form', () => {
  it('sorts object keys', () => {
    expect(canonicalString({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it('sorts keys by UTF-16 code unit, not by locale', () => {
    // A locale-aware sort would put 'ä' next to 'a'; JCS is defined on code units.
    expect(canonicalString({ ä: 1, a: 2, z: 3 })).toBe('{"a":2,"z":3,"ä":1}')
  })

  it('sorts nested objects too', () => {
    expect(canonicalString({ outer: { b: 1, a: 2 } })).toBe('{"outer":{"a":2,"b":1}}')
  })

  it('preserves array order, which carries meaning', () => {
    expect(canonicalString({ a: [3, 1, 2] })).toBe('{"a":[3,1,2]}')
  })

  it('emits no insignificant whitespace', () => {
    expect(canonicalString({ a: 1, b: [1, 2] })).toBe('{"a":1,"b":[1,2]}')
  })

  it('normalises negative zero', () => {
    expect(canonicalString({ n: -0 })).toBe('{"n":0}')
  })

  it('formats numbers as ECMAScript does', () => {
    expect(canonicalString({ n: 1e30 })).toBe('{"n":1e+30}')
    expect(canonicalString({ n: 0.1 })).toBe('{"n":0.1}')
    expect(canonicalString({ n: 1.0 })).toBe('{"n":1}')
  })

  it('emits non-ASCII characters literally rather than escaped', () => {
    expect(canonicalString({ s: '€' })).toBe('{"s":"€"}')
  })

  it('escapes what JSON requires and nothing more', () => {
    expect(canonicalString({ s: 'a\\"b\n' })).toBe('{"s":"a\\\\\\"b\\n"}')
  })

  it('is stable across key insertion order', () => {
    const first: JsonValue = { a: 1, b: { c: 2, d: 3 } }
    const second: JsonValue = { b: { d: 3, c: 2 }, a: 1 }
    expect(canonicalString(first)).toBe(canonicalString(second))
    expect(hex(digest(first))).toBe(hex(digest(second)))
  })
})

describe('the omitted-versus-null distinction', () => {
  // An unset constraint is omitted, never null. These must not collide.
  it('distinguishes an omitted key from a null one', () => {
    expect(canonicalString({})).not.toBe(canonicalString({ minimum: null }))
    expect(hex(digest({}))).not.toBe(hex(digest({ minimum: null })))
  })

  it('keeps null as null', () => {
    expect(canonicalString({ minimum: null })).toBe('{"minimum":null}')
  })
})

describe('values that cannot be signed', () => {
  it('rejects undefined rather than silently dropping the key', () => {
    // The failure this prevents: canonicalize drops the member, so the caller believes it signed a
    // payload with `a` and actually signed one without.
    expect(() => canonicalString({ a: undefined, b: 1 } as unknown as JsonValue))
      .toThrow(/unsignable-payload: \$\.a is undefined/)
  })

  it('rejects undefined nested in an array', () => {
    expect(() => canonicalString([1, undefined] as unknown as JsonValue))
      .toThrow(/\$\[1\] is undefined/)
  })

  it('rejects undefined at the root', () => {
    expect(() => canonicalString(undefined as unknown as JsonValue)).toThrow(/unsignable-payload/)
  })

  it.each([NaN, Infinity, -Infinity])('rejects the non-finite number %s', (value) => {
    expect(() => canonicalString({ n: value })).toThrow(/unsignable-payload: \$\.n/)
  })

  it('rejects a function', () => {
    expect(() => canonicalString({ fn: () => 1 } as unknown as JsonValue))
      .toThrow(/\$\.fn is a function/)
  })

  it('rejects a bigint', () => {
    expect(() => canonicalString({ n: 1n } as unknown as JsonValue)).toThrow(/\$\.n is a bigint/)
  })

  it('rejects a Date rather than converting it', () => {
    // Signing a Date would quietly attest to an ISO string the caller never wrote.
    expect(() => canonicalString({ at: new Date(0) } as unknown as JsonValue))
      .toThrow(/\$\.at is a Date/)
  })

  it('rejects a Map, which would serialise as an empty object', () => {
    expect(() => canonicalString({ m: new Map() } as unknown as JsonValue)).toThrow(/\$\.m is a Map/)
  })

  it('rejects a circular reference rather than overflowing the stack', () => {
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic.self = cyclic
    expect(() => canonicalString(cyclic as JsonValue)).toThrow(/circular reference/)
  })

  it('names the path so a large payload can be debugged', () => {
    expect(() => canonicalString({ outer: { inner: [0, { bad: undefined }] } } as unknown as JsonValue))
      .toThrow(/\$\.outer\.inner\[1\]\.bad/)
  })

  it('allows a repeated object that is not circular', () => {
    const shared = { a: 1 }
    expect(() => assertSignable({ first: shared, second: shared })).not.toThrow()
  })

  it('allows a null-prototype object, which JSON.parse can produce', () => {
    const object = Object.assign(Object.create(null), { a: 1 })
    expect(() => assertSignable(object)).not.toThrow()
  })
})

describe('digest', () => {
  it('is 32 bytes of SHA-256', () => {
    expect(digest({ a: 1 }).length).toBe(32)
  })

  it('hashes the canonical bytes, not the input text', () => {
    // SHA-256 of the ASCII bytes `{"a":1}`, cross-checked against node:crypto below.
    expect(hex(digest({ a: 1 })))
      .toBe('015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862')
  })

  it.each([
    { a: 1 },
    { b: 1, a: 2 },
    { s: '€', n: 1e30, nested: { z: [1, 2, null] } },
    {}
  ])('agrees with an independent SHA-256 implementation for %j', (payload) => {
    // A second implementation is the only thing that distinguishes "correct" from "self-consistent"
    // — the same reasoning E2 applies across languages, applied here across libraries.
    const expected = createHash('sha256').update(canonicalBytes(payload as JsonValue)).digest('hex')
    expect(hex(digest(payload as JsonValue))).toBe(expected)
  })

  it('produces the canonical bytes it hashes', () => {
    expect(new TextDecoder().decode(canonicalBytes({ b: 1, a: 2 }))).toBe('{"a":2,"b":1}')
  })

  it('changes when any signed value changes', () => {
    expect(hex(digest({ a: 1 }))).not.toBe(hex(digest({ a: 2 })))
    expect(hex(digest({ a: 1 }))).not.toBe(hex(digest({ b: 1 })))
  })
})
