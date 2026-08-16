import { describe, it, expect } from 'vitest'
import { createHmac, hkdfSync } from 'node:crypto'
import { deriveSessionKey, SESSION_TOKEN_LABEL, SESSION_KEY_BYTES } from './derivedKeys'
import { getAlgorithm, ROOT_ALGORITHM } from './algorithms'

const seed = new Uint8Array(48).fill(7)
const other = new Uint8Array(48).fill(8)
const hex = (b: Uint8Array): string => [...b].map(x => x.toString(16).padStart(2, '0')).join('')

describe('deriveSessionKey', () => {
  it('produces a 32 byte key', () => {
    expect(deriveSessionKey(seed)).toHaveLength(SESSION_KEY_BYTES)
  })

  it('is deterministic, so nothing has to be stored', () => {
    expect(hex(deriveSessionKey(seed))).toBe(hex(deriveSessionKey(seed)))
  })

  it('differs for a different seed, so rotating the root signs everyone out', () => {
    expect(hex(deriveSessionKey(seed))).not.toBe(hex(deriveSessionKey(other)))
  })

  it('agrees with an independent HKDF implementation', () => {
    // A second implementation is what distinguishes "correct" from "self-consistent".
    const expected = new Uint8Array(hkdfSync(
      'sha256', seed, new Uint8Array(0), new TextEncoder().encode(SESSION_TOKEN_LABEL), SESSION_KEY_BYTES
    ))
    expect(hex(deriveSessionKey(seed))).toBe(hex(expected))
  })
})

describe('domain separation', () => {
  it('is unrelated to the signing key the same seed produces', () => {
    // The property that makes reusing the seed sound: one seed, two unrelated outputs.
    const signing = getAlgorithm(ROOT_ALGORITHM).generateKeypair(seed)
    const session = deriveSessionKey(seed)
    expect(hex(session)).not.toBe(hex(signing.secretKey.slice(0, SESSION_KEY_BYTES)))
    expect(hex(session)).not.toBe(hex(signing.publicKey))
  })

  it('would differ under another label, so a future derivation cannot collide', () => {
    const asIfAnotherPurpose = new Uint8Array(hkdfSync(
      'sha256', seed, new Uint8Array(0), new TextEncoder().encode('genoacms:something-else:v1'), SESSION_KEY_BYTES
    ))
    expect(hex(deriveSessionKey(seed))).not.toBe(hex(asIfAnotherPurpose))
  })

  it('is versioned, so the label is never edited in place', () => {
    expect(SESSION_TOKEN_LABEL).toMatch(/:v\d+$/)
  })
})

describe('as an HMAC key', () => {
  it('signs a token far smaller than an asymmetric signature would', () => {
    // ML-DSA-65 would be 4412 base64url characters of signature alone, past a cookie's 4 KB limit.
    const mac = createHmac('sha256', deriveSessionKey(seed)).update('header.payload').digest('base64url')
    expect(mac.length).toBe(43)
  })
})
