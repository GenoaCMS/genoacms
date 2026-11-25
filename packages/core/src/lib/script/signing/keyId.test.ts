import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { KEY_ID_LENGTH, deriveKeyId, matchesKeyId } from './keyId'
import { getAlgorithm, ROOT_ALGORITHM, SUBORDINATE_ALGORITHM } from './algorithms'

const key = (bytes: number[]): Uint8Array => new Uint8Array(bytes)

describe('deriveKeyId', () => {
  it('ENV-4: is the first 16 hex characters of SHA-256 over the public key', () => {
    const publicKey = key([1, 2, 3])
    const expected = createHash('sha256').update(Buffer.from(publicKey)).digest('hex').slice(0, 16)
    expect(deriveKeyId(publicKey)).toBe(expected)
  })

  it('ENV-4: produces a 16 character lowercase hex id', () => {
    expect(deriveKeyId(key([1, 2, 3]))).toMatch(/^[0-9a-f]{16}$/)
    expect(deriveKeyId(key([1, 2, 3]))).toHaveLength(KEY_ID_LENGTH)
  })

  it('ENV-4: is stable for the same key', () => {
    expect(deriveKeyId(key([9, 9, 9]))).toBe(deriveKeyId(key([9, 9, 9])))
  })

  it('ENV-4: differs for a key that differs by one bit', () => {
    // The property that makes an id impossible to reuse for a different key.
    expect(deriveKeyId(key([0]))).not.toBe(deriveKeyId(key([1])))
  })

  it('ENV-4: differs for keys of different length with a shared prefix', () => {
    expect(deriveKeyId(key([1, 2]))).not.toBe(deriveKeyId(key([1, 2, 0])))
  })

  it.each([ROOT_ALGORITHM, SUBORDINATE_ALGORITHM])('ENV-4: gives distinct ids to distinct %s keys', (name) => {
    const algorithm = getAlgorithm(name)
    const first = algorithm.generateKeypair(new Uint8Array(algorithm.lengths.seed).fill(1))
    const second = algorithm.generateKeypair(new Uint8Array(algorithm.lengths.seed).fill(2))
    expect(deriveKeyId(first.publicKey)).not.toBe(deriveKeyId(second.publicKey))
  })
})

describe('matchesKeyId', () => {
  it('ENV-4: confirms a key against its own id', () => {
    const publicKey = key([4, 5, 6])
    expect(matchesKeyId(publicKey, deriveKeyId(publicKey))).toBe(true)
  })

  it('ENV-4: rejects a key presented under another key id', () => {
    // What lets a verifier notice that a registry entry names one key and carries another.
    expect(matchesKeyId(key([4, 5, 6]), deriveKeyId(key([7, 8, 9])))).toBe(false)
  })

  it.each(['', 'not-hex', 'ABCDEF0123456789'])('ENV-4: rejects the malformed id %j', (keyId) => {
    expect(matchesKeyId(key([4, 5, 6]), keyId)).toBe(false)
  })
})
