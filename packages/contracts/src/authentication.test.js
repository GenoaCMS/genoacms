import { describe, it, expect } from 'vitest'
import { isRejection } from './authentication/index.js'

describe('the authentication contract', () => {
  it('AUTHN-2: isRejection tells a rejection from an identity', () => {
    expect(isRejection({ rejected: 'credentials' })).toBe(true)
    expect(isRejection({ subject: 's', email: 'e' })).toBe(false)
  })
})
