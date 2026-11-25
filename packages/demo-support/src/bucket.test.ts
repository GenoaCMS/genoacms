import { describe, it, expect } from 'vitest'
import { isImmutable } from './bucket.js'

describe('what may be cached without bound', () => {
  it('caches a publication forever', () => {
    expect(isImmutable('.genoacms/components/public/component-1/publication-1.json')).toBe(true)
  })

  it('caches a key file forever', () => {
    expect(isImmutable('.genoacms/keys/public/0123456789abcdef.json')).toBe(true)
  })

  it('never caches the key manifest', () => {
    expect(isImmutable('.genoacms/keys/public.json')).toBe(false)
  })

  it('does not cache a traversal out of the key files, or a key id of 15 or 17 characters', () => {
    expect(isImmutable('.genoacms/keys/public/../secrets.json')).toBe(false)
    expect(isImmutable('.genoacms/keys/public/0123456789abcde.json')).toBe(false)
    expect(isImmutable('.genoacms/keys/public/0123456789abcdef0.json')).toBe(false)
  })
})
