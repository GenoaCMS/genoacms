import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Adapter, Identity } from '@genoacms/contracts/authentication'

/**
 * The trial across providers (AUTHN-5) and session revalidation (AUTHN-7).
 *
 * The host is replaced by an in-memory one whose providers are configured per test, so the order of
 * calls, which providers are reached, and what each one said are all observable.
 */

const EMAIL = 'ada@example.com'
const PASSWORD = 'lovelace-secret'
const ada: Identity = { subject: 's-ada', email: EMAIL }

type Provider = Partial<Adapter> | Error

const configured: { providers: Record<string, Provider> } = { providers: {} }
const calls: string[] = []

vi.mock('$lib/script/host.server', () => ({
  host: {
    get authenticationProviderKeys () { return Object.keys(configured.providers) },
    authentication: async (key: string) => {
      const provider = configured.providers[key]
      if (provider === undefined) throw new Error(`provider/not-found: ${key}`)
      if (provider instanceof Error) throw provider
      return {
        authenticate: async (email: string, password: string) => {
          calls.push(`${key}.authenticate`)
          return await provider.authenticate!(email, password)
        },
        getIdentity: async (subject: string) => {
          calls.push(`${key}.getIdentity`)
          return await provider.getIdentity!(subject)
        }
      }
    }
  }
}))

const { signIn, revalidate } = await import('./providers.server')

const returning = (identity: Identity): Partial<Adapter> => ({ authenticate: async () => identity, getIdentity: async () => identity })
const rejecting = (reason: 'credentials' | 'disabled' | 'second-factor-required'): Partial<Adapter> => ({ authenticate: async () => ({ rejected: reason }) })
const throwing = (message: string): Partial<Adapter> => ({
  authenticate: async () => { throw new Error(message) },
  getIdentity: async () => { throw new Error(message) }
})
const knowing = (identity: Identity | null): Partial<Adapter> => ({ getIdentity: async () => identity })

let warnings: string[]
let errors: string[]

beforeEach(() => {
  configured.providers = {}
  calls.length = 0
  warnings = []
  errors = []
  vi.spyOn(console, 'warn').mockImplementation((line: string) => { warnings.push(line) })
  vi.spyOn(console, 'error').mockImplementation((line: string) => { errors.push(line) })
})

afterEach(() => { vi.restoreAllMocks() })

describe('signing in across providers', () => {
  it('AUTHN-5: stops at the first provider that returns an identity', async () => {
    configured.providers = { a: returning(ada), b: returning({ subject: 's-other', email: EMAIL }) }

    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'signed-in', provider: 'a', identity: ada })
    expect(calls).toEqual(['a.authenticate'])
  })

  it('AUTHN-5: a credentials rejection moves on to the next provider', async () => {
    configured.providers = { a: rejecting('credentials'), b: returning(ada) }

    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'signed-in', provider: 'b', identity: ada })
  })

  it('AUTHN-5: a rejection other than credentials stops the trial', async () => {
    configured.providers = { a: rejecting('disabled'), b: returning(ada) }

    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'failed', failure: 'invalid-credentials' })
    expect(calls).toEqual(['a.authenticate'])
  })

  it('AUTHN-5: a provider that throws does not stop the trial', async () => {
    configured.providers = { a: throwing('authentication/provider-failed: 503 down'), b: returning(ada) }

    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'signed-in', provider: 'b', identity: ada })
  })

  it('AUTHN-5: an outage reads as unavailable, not as wrong credentials', async () => {
    configured.providers = { a: throwing('authentication/provider-failed: 503 down'), b: rejecting('credentials') }

    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'failed', failure: 'sign-in-unavailable' })
  })

  it('AUTHN-5: a throttled provider reads as too many attempts', async () => {
    configured.providers = { a: throwing('authentication/throttled') }

    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'failed', failure: 'too-many-attempts' })
  })

  it('AUTHN-5: a provider that fails to construct counts as one that threw', async () => {
    configured.providers = { a: new Error('provider/secret-unavailable: a'), b: rejecting('credentials') }

    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'failed', failure: 'sign-in-unavailable' })
  })

  it('AUTHN-5: logs rejections and failures without the email or password', async () => {
    configured.providers = { a: rejecting('credentials'), b: throwing('authentication/provider-failed: 503 down') }

    await signIn(EMAIL, PASSWORD)

    expect(warnings).toEqual(['[genoacms:auth] provider a rejected the sign-in: credentials'])
    expect(errors).toEqual(['[genoacms:auth] provider b failed: authentication/provider-failed: 503 down'])
    for (const line of [...warnings, ...errors]) {
      expect(line).not.toContain(EMAIL)
      expect(line).not.toContain(PASSWORD)
    }
  })
})

describe('revalidating a session', () => {
  it('AUTHN-7: revalidates with the recorded provider only', async () => {
    configured.providers = { a: knowing(ada), b: knowing(ada) }

    expect(await revalidate(ada.subject, 'b')).toEqual(ada)
    expect(calls).toEqual(['b.getIdentity'])
  })

  it('AUTHN-7: a provider no longer configured ends the session', async () => {
    configured.providers = { a: knowing(ada) }

    expect(await revalidate(ada.subject, 'c')).toBeNull()
    expect(calls).toEqual([])
  })

  it('AUTHN-7: revalidates a family without a provider against every provider in order', async () => {
    configured.providers = { a: knowing(null), b: knowing(ada) }
    expect(await revalidate(ada.subject, undefined)).toEqual(ada)
    expect(calls).toEqual(['a.getIdentity', 'b.getIdentity'])

    configured.providers = { a: knowing(null), b: knowing(null) }
    expect(await revalidate(ada.subject, undefined)).toBeNull()
  })

  it('AUTHN-7: a provider failure fails the revalidation', async () => {
    configured.providers = { a: knowing(ada), b: throwing('authentication/provider-failed: 503 down') }

    await expect(revalidate(ada.subject, 'b')).rejects.toThrow(/^session\/revalidation-failed: b:/)
  })
})
