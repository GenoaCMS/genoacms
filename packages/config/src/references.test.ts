import { describe, it, expect } from 'vitest'
import { secret, env, inline, isSecretRef, isEnvRef, isInlineRef, isReference } from './references.js'

describe('reference helpers', () => {
  it('build the collapsed reference objects', () => {
    expect(secret('GCS_SA')).toEqual({ $secret: 'GCS_SA' })
    expect(env('HOME')).toEqual({ $env: 'HOME' })
    expect(inline({ a: 1 })).toEqual({ $inline: { a: 1 } })
  })

  it('refuse a secret key outside the portable pattern, and an empty variable name', () => {
    expect(() => secret('a-b')).toThrow(/^invalid-secret-key/)
    expect(() => env('')).toThrow(/^config\/invalid-env-reference/)
  })
})

describe('reference guards', () => {
  it("recognize each helper's output", () => {
    expect(isSecretRef(secret('K'))).toBe(true)
    expect(isEnvRef(env('V'))).toBe(true)
    expect(isInlineRef(inline(null))).toBe(true)
    expect([secret('K'), env('V'), inline(1)].every(isReference)).toBe(true)
  })

  it('refuse objects with extra keys, non-string pointers and other values', () => {
    expect(isSecretRef({ $secret: 'K', note: 'x' })).toBe(false)
    expect(isSecretRef({ $secret: 1 })).toBe(false)
    expect(isEnvRef({ $env: null })).toBe(false)
    expect(isReference('K')).toBe(false)
    expect(isReference(null)).toBe(false)
    expect(isReference([{ $secret: 'K' }])).toBe(false)
  })
})
