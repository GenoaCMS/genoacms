import { describe, it, expectTypeOf } from 'vitest'
import type { ServiceAccount } from './serviceAccount.js'

describe('ServiceAccount', () => {
  it('COM-1: has the fields of a Google key file the client libraries read', () => {
    expectTypeOf<ServiceAccount>().toEqualTypeOf<{
      type: string
      project_id: string
      private_key_id: string
      private_key: string
      client_email: string
      client_id: string
      auth_uri?: string
      token_uri?: string
      auth_provider_x509_cert_url?: string
      client_x509_cert_url?: string
      universe_domain?: string
    }>()
  })
})
