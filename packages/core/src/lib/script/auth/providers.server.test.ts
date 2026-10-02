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
/** Lines on the channels core does not log to: `log`, `info` and `debug`. */
let others: string[]

beforeEach(() => {
  configured.providers = {}
  calls.length = 0
  warnings = []
  errors = []
  others = []
  for (const channel of ['log', 'info', 'debug'] as const) {
    vi.spyOn(console, channel).mockImplementation((...line: unknown[]) => { others.push(line.join(' ')) })
  }
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
    configured.providers = { a: rejecting('credentials'), b: throwing('authentication/provider-failed: 503 down'), c: returning(ada) }

    await signIn(EMAIL, PASSWORD)

    expect(warnings).toEqual(['[genoacms:auth] provider a rejected the sign-in: credentials'])
    expect(errors).toEqual(['[genoacms:auth] provider b failed: authentication/provider-failed: 503 down'])
    for (const line of [...warnings, ...errors, ...others]) {
      expect(line).not.toContain(EMAIL)
      expect(line).not.toContain(PASSWORD)
    }
  })
})

describe('the trial\'s mixed failures and logs (CS1)', () => {
  it('AUTHN-5: a stopping rejection after an outage fails as invalid credentials', async () => {
    configured.providers = { a: throwing('authentication/provider-failed: 503 down'), b: rejecting('disabled') }

    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'failed', failure: 'invalid-credentials' })
  })

  it('AUTHN-5: a throttled provider reads as too many attempts whatever the others threw', async () => {
    configured.providers = { a: throwing('authentication/provider-failed: 503 down'), b: throwing('authentication/throttled') }
    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'failed', failure: 'too-many-attempts' })

    configured.providers = { b: throwing('authentication/throttled'), a: throwing('authentication/provider-failed: 503 down') }
    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'failed', failure: 'too-many-attempts' })
  })

  it('AUTHN-5: only a message starting authentication/throttled is throttled', async () => {
    configured.providers = { a: throwing('authentication/provider-failed: 429 throttled') }
    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'failed', failure: 'sign-in-unavailable' })

    configured.providers = { a: throwing('authentication/throttled: retry after 30s') }
    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'failed', failure: 'too-many-attempts' })

    configured.providers = { a: throwing('authentication/rate-limited') }
    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'failed', failure: 'sign-in-unavailable' })
  })

  it('AUTHN-5: logs every rejection and every failure', async () => {
    configured.providers = {
      a: rejecting('credentials'),
      b: throwing('authentication/provider-failed: 503 down'),
      c: throwing('authentication/provider-failed: 500 broken'),
      d: rejecting('disabled')
    }

    await signIn(EMAIL, PASSWORD)

    expect(warnings).toEqual([
      '[genoacms:auth] provider a rejected the sign-in: credentials',
      '[genoacms:auth] provider d rejected the sign-in: disabled'
    ])
    expect(errors).toEqual([
      '[genoacms:auth] provider b failed: authentication/provider-failed: 503 down',
      '[genoacms:auth] provider c failed: authentication/provider-failed: 500 broken'
    ])
  })
})

describe('the trial, after CS2', () => {
  it('AUTHN-5: tries the providers in config order, not sorted order', async () => {
    configured.providers = { b: rejecting('credentials'), a: returning(ada) }

    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'signed-in', provider: 'a', identity: ada })
    expect(calls).toEqual(['b.authenticate', 'a.authenticate'])
  })

  it('AUTHN-5: a second-factor rejection stops the trial and is logged', async () => {
    configured.providers = { a: rejecting('second-factor-required'), b: returning(ada) }

    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'failed', failure: 'invalid-credentials' })
    expect(calls).toEqual(['a.authenticate'])
    expect(warnings).toEqual(['[genoacms:auth] provider a rejected the sign-in: second-factor-required'])
  })

  it('AUTHN-5: several failures, none throttled, read as unavailable', async () => {
    configured.providers = { a: throwing('authentication/provider-failed: 503 down'), b: throwing('authentication/provider-failed: 500 broken') }

    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'failed', failure: 'sign-in-unavailable' })
  })

  it('AUTHN-5: a stopping rejection after a throttled provider fails as invalid credentials', async () => {
    configured.providers = { a: throwing('authentication/throttled'), b: rejecting('disabled') }

    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'failed', failure: 'invalid-credentials' })
  })

  it('AUTHN-5: a provider that fails to construct is logged', async () => {
    configured.providers = { a: new Error('provider/secret-unavailable: a') }

    await signIn(EMAIL, PASSWORD)

    expect(errors).toEqual(['[genoacms:auth] provider a failed: provider/secret-unavailable: a'])
  })

  it('AUTHN-5: returns the provider\'s identity unchanged', async () => {
    const mixedCase = { subject: 's-ada', email: 'Ada@Example.COM' }
    configured.providers = { a: returning(mixedCase) }

    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'signed-in', provider: 'a', identity: mixedCase })
  })

  it.fails('AUTHN-5: no provider configured reads as unavailable', async () => {
    configured.providers = {}

    expect(await signIn(EMAIL, PASSWORD)).toEqual({ outcome: 'failed', failure: 'sign-in-unavailable' })
    expect(errors).toEqual(['[genoacms:auth] no authentication provider is configured'])
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

  it('AUTHN-7: a failure during the lookup in order fails the revalidation', async () => {
    configured.providers = { a: throwing('authentication/provider-failed: 503 down'), b: knowing(null) }

    await expect(revalidate(ada.subject, undefined)).rejects.toThrow(/^session\/revalidation-failed: a:/)
  })

  it('AUTHN-7: a gone identity at the recorded provider is not looked up elsewhere', async () => {
    configured.providers = { a: knowing(ada), b: knowing(null) }

    expect(await revalidate(ada.subject, 'b')).toBeNull()
    expect(calls).toEqual(['b.getIdentity'])
  })

  it('AUTHN-7: the lookup in order follows config order and stops at the first identity', async () => {
    const atB = { subject: ada.subject, email: 'ada@b.example.com' }
    configured.providers = { b: knowing(atB), a: knowing(ada) }
    expect(await revalidate(ada.subject, undefined)).toEqual(atB)
    expect(calls).toEqual(['b.getIdentity'])

    configured.providers = { a: knowing(ada), b: throwing('authentication/provider-failed: 503 down') }
    expect(await revalidate(ada.subject, undefined)).toEqual(ada)
  })

  it.fails('AUTHN-7: a failure in the lookup in order moves on to the next provider', async () => {
    configured.providers = { a: throwing('authentication/provider-failed: 503 down'), b: knowing(ada) }

    expect(await revalidate(ada.subject, undefined)).toEqual(ada)
  })

  it('AUTHN-7: a throttled provider fails the revalidation', async () => {
    configured.providers = { a: knowing(ada), b: throwing('authentication/throttled') }

    await expect(revalidate(ada.subject, 'b')).rejects.toThrow(/^session\/revalidation-failed: b:/)
  })

  it('AUTHN-7: revalidation returns the provider\'s identity unchanged', async () => {
    const mixedCase = { subject: ada.subject, email: 'Ada@New.Example.com' }
    configured.providers = { b: knowing(mixedCase) }

    expect(await revalidate(ada.subject, 'b')).toEqual(mixedCase)
  })

  it('AUTHN-7: the lookup in order takes the first identity', async () => {
    configured.providers = { a: knowing(ada), b: knowing({ subject: ada.subject, email: 'ada@other.example.com' }) }

    expect(await revalidate(ada.subject, undefined)).toEqual(ada)
  })
})
