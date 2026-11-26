import { describe, it, expect } from 'vitest'
import { isValidSecretKey, assertValidSecretKey } from './secrets/index.js'

describe('the portable secret key rule', () => {
  it.each(['A', '_a1', 'GENOACMS_ROOT_KEY_SEED'])('REF-8: accepts %s', (key) => {
    expect(isValidSecretKey(key)).toBe(true)
  })

  it.each(['1a', 'a-b', 'a.b', ''])('REF-8: refuses %o', (key) => {
    expect(isValidSecretKey(key)).toBe(false)
  })

  it('REF-8: throws rather than normalizing', () => {
    expect(() => assertValidSecretKey('a-b')).toThrow(/^invalid-secret-key:/)
  })
})
