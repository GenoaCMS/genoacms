import { describe, it, expect } from 'vitest'
import { keyState, describeKey, describeKeys } from './keyAdministration'
import type { KeyRegistry, SubordinateKeyEntry } from './registry'

/**
 * What the registry's two optional timestamps mean to an administrator.
 *
 * The distinction under test is the one an interface is most likely to blur: a superseded key
 * still verifies, a revoked key verifies nothing.
 */

const entry = (
  keyId: string,
  fields: Partial<SubordinateKeyEntry> = {}
): SubordinateKeyEntry => ({
  keyId,
  alg: 'ML-DSA-65',
  publicKey: 'AA==',
  createdAt: 1,
  ...fields
} as SubordinateKeyEntry)

const registry = (current: string, keys: SubordinateKeyEntry[]): KeyRegistry =>
  ({ sequence: 1, current, keys })

describe('key state', () => {
  it('is current for the key the registry names', () => {
    expect(keyState(entry('a'), 'a')).toBe('current')
  })

  it('is superseded for any other key that is not revoked', () => {
    expect(keyState(entry('a', { supersededAt: 2 }), 'b')).toBe('superseded')
    // Even without the marker: not being current is what stops a key signing.
    expect(keyState(entry('a'), 'b')).toBe('superseded')
  })

  it('is revoked whenever it is revoked, superseded or not', () => {
    // Both are true of a key rotated away from and later revoked. Reporting the milder one would
    // describe a key that verifies nothing as merely retired.
    expect(keyState(entry('a', { supersededAt: 2, revokedAt: 3 }), 'b')).toBe('revoked')
  })
})

describe('describing a key', () => {
  it('omits timestamps it does not have rather than carrying undefined', () => {
    const described = describeKey(entry('a'), 'a')

    expect(described).not.toHaveProperty('supersededAt')
    expect(described).not.toHaveProperty('revokedAt')
  })

  it('offers revocation for a current key', () => {
    // The service rotates away from it first, so this is a real operation rather than one the
    // registry would reject.
    expect(describeKey(entry('a'), 'a').revocable).toBe(true)
  })

  it('refuses to offer it twice for the same key', () => {
    expect(describeKey(entry('a', { revokedAt: 3 }), 'b').revocable).toBe(false)
  })
})

describe('ordering', () => {
  it('puts the current key first and the rest newest to oldest', () => {
    // Rotation appends, so the stored order is the reverse of what is looked for.
    const described = describeKeys(registry('b', [
      entry('a', { createdAt: 1, supersededAt: 2 }),
      entry('b', { createdAt: 2 }),
      entry('c', { createdAt: 3, revokedAt: 4 })
    ]))

    expect(described.map(key => key.keyId)).toEqual(['b', 'c', 'a'])
  })

  it('keeps the current key first even when it is not the newest entry', () => {
    const described = describeKeys(registry('a', [
      entry('a', { createdAt: 1 }),
      entry('z', { createdAt: 9, revokedAt: 10 })
    ]))

    expect(described[0].keyId).toBe('a')
  })
})
