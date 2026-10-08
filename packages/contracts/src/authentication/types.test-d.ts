import { describe, it, expectTypeOf } from 'vitest'
import type { Identity } from '@genoacms/contracts/authentication'

describe('Identity', () => {
  it('AUTHN-1: is { subject: string, email: string }', () => {
    expectTypeOf<Identity>().toEqualTypeOf<{ subject: string, email: string }>()
  })
})
