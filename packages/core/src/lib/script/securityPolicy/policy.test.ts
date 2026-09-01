import { describe, it, expect } from 'vitest'
import {
  parseSecurityPolicy,
  isRotationDue,
  guardCeilings,
  DAY_MS,
  MIN_ROTATION_DAYS,
  MAX_ROTATION_DAYS,
  MIN_FUEL,
  MAX_FUEL,
  MIN_DEPTH,
  MAX_DEPTH,
  MIN_ALLOCATION,
  MAX_ALLOCATION,
  MAX_FETCH_ORIGINS,
  type SecurityPolicy
} from './policy'

const CEILINGS = { maxFuel: 1_000_000, maxDepth: 100, maxAllocation: 10_000_000 }
const ORIGINS = { fetchOrigins: [] as string[] }

const policy = (days: number): SecurityPolicy =>
  ({ subordinateKeyRotationDays: days, accessTokenMinutes: 15, grantCacheSeconds: 30, refreshTokenDays: 14, ...CEILINGS, ...ORIGINS })
const complete = (over: Record<string, unknown> = {}): unknown =>
  ({ subordinateKeyRotationDays: 90, accessTokenMinutes: 15, grantCacheSeconds: 30, refreshTokenDays: 14, ...CEILINGS, ...ORIGINS, ...over })
const withDays = (days: unknown): unknown => complete({ subordinateKeyRotationDays: days })

describe('parseSecurityPolicy', () => {
  it('accepts a policy at the documented default', () => {
    expect(parseSecurityPolicy(withDays(90)))
      .toEqual({ ok: true, policy: policy(90) })
  })

  it.each([MIN_ROTATION_DAYS, MAX_ROTATION_DAYS])('accepts the boundary value %s', (days) => {
    expect(parseSecurityPolicy(withDays(days)).ok).toBe(true)
  })

  it.each([0, -1, MAX_ROTATION_DAYS + 1, 5000])('rejects the out-of-range value %s', (days) => {
    expect(parseSecurityPolicy(withDays(days)).ok).toBe(false)
  })

  it.each([1.5, '90', null, undefined, NaN])('rejects the non-integer value %s', (days) => {
    expect(parseSecurityPolicy(withDays(days)).ok).toBe(false)
  })

  it('rejects a field this version does not know', () => {
    // A document from a newer version. Acting on half of it would mean acting on a policy only
    // half understood — and the unknown half may be the part that tightens something.
    expect(parseSecurityPolicy(complete({ maxEgressBytes: 1000 })))
      .toMatchObject({ ok: false, reason: expect.stringContaining('unexpected fields') })
  })

  it.each([null, 'a string', 42, []])('rejects the non-policy value %s', (value) => {
    expect(parseSecurityPolicy(value).ok).toBe(false)
  })
})

describe('accessTokenMinutes', () => {
  it('accepts the documented default', () => {
    expect(parseSecurityPolicy(complete()).ok).toBe(true)
  })

  it.each([0, -1, 1441, 1.5, '15', null])('rejects the invalid value %s', (minutes) => {
    expect(parseSecurityPolicy(complete({ accessTokenMinutes: minutes })).ok).toBe(false)
  })

  it('rejects a policy that omits it', () => {
    expect(parseSecurityPolicy({ subordinateKeyRotationDays: 90, grantCacheSeconds: 30, refreshTokenDays: 14, ...CEILINGS, ...ORIGINS }).ok).toBe(false)
  })
})

describe('grantCacheSeconds', () => {
  it('accepts the documented default', () => {
    expect(parseSecurityPolicy(complete({ grantCacheSeconds: 30 })).ok).toBe(true)
  })

  it('accepts zero, meaning resolve every request', () => {
    expect(parseSecurityPolicy(complete({ grantCacheSeconds: 0 })).ok).toBe(true)
  })

  it.each([-1, 301, 1.5, '30', null])('rejects the invalid value %s', (seconds) => {
    // Beyond the maximum a revoked permission outlives the incident it was revoked for.
    expect(parseSecurityPolicy(complete({ grantCacheSeconds: seconds })).ok).toBe(false)
  })

  it('rejects a policy that omits it', () => {
    expect(parseSecurityPolicy({ subordinateKeyRotationDays: 90, accessTokenMinutes: 15, refreshTokenDays: 14, ...CEILINGS, ...ORIGINS }).ok).toBe(false)
  })
})

describe('the guard ceilings', () => {
  it.each([
    ['maxFuel', MIN_FUEL, MAX_FUEL],
    ['maxDepth', MIN_DEPTH, MAX_DEPTH],
    ['maxAllocation', MIN_ALLOCATION, MAX_ALLOCATION]
  ])('accepts %s at both boundaries', (field, min, max) => {
    expect(parseSecurityPolicy(complete({ [field]: min })).ok).toBe(true)
    expect(parseSecurityPolicy(complete({ [field]: max })).ok).toBe(true)
  })

  it.each([
    ['maxFuel', MIN_FUEL, MAX_FUEL],
    ['maxDepth', MIN_DEPTH, MAX_DEPTH],
    ['maxAllocation', MIN_ALLOCATION, MAX_ALLOCATION]
  ])('rejects %s outside them', (field, min, max) => {
    expect(parseSecurityPolicy(complete({ [field]: min - 1 })).ok).toBe(false)
    expect(parseSecurityPolicy(complete({ [field]: max + 1 })).ok).toBe(false)
  })

  it.each(['maxFuel', 'maxDepth', 'maxAllocation'])('rejects a policy that omits %s', (field) => {
    // An absent ceiling would compile a component the guards cannot bound, which is the outcome
    // they exist to prevent.
    const without = complete() as Record<string, unknown>
    delete without[field]

    expect(parseSecurityPolicy(without).ok).toBe(false)
  })

  it.each([1.5, '1000', null, NaN])('rejects the non-integer maxFuel %s', (value) => {
    expect(parseSecurityPolicy(complete({ maxFuel: value })).ok).toBe(false)
  })

  it('names the field it refused', () => {
    expect(parseSecurityPolicy(complete({ maxDepth: 0 })))
      .toMatchObject({ reason: expect.stringContaining('policy.maxDepth') })
  })
})

describe('the fetch origin allowlist', () => {
  it('is empty by default, which permits nothing', () => {
    // A bridge reaching everywhere until somebody narrowed it is indistinguishable from no bridge
    // for as long as nobody notices.
    expect(parseSecurityPolicy(complete()).ok).toBe(true)
  })

  it.each([
    ['a plain origin', ['https://api.example.com']],
    ['a port', ['https://api.example.com:8443']],
    ['plain http, which an operator may still want on a private network', ['http://localhost:3000']],
    ['several', ['https://a.example.com', 'https://b.example.com']],
    [`${MAX_FETCH_ORIGINS} of them`, Array.from({ length: MAX_FETCH_ORIGINS }, (_, i) => `https://h${i}.example.com`)]
  ])('accepts %s', (_why, fetchOrigins) => {
    expect(parseSecurityPolicy(complete({ fetchOrigins })).ok).toBe(true)
  })

  it.each([
    ['a trailing slash, which is a path and not an origin', ['https://api.example.com/']],
    ['a path', ['https://api.example.com/v1']],
    ['a bare host with no scheme', ['api.example.com']],
    ['a wildcard, which an allowlist is the opposite of', ['*']],
    ['a scheme that reaches the filesystem', ['file:///etc/passwd']],
    ['something that is not a string', [42]],
    ['an empty string', ['']],
    ['the same origin twice', ['https://a.example.com', 'https://a.example.com']],
    ['more than the maximum', Array.from({ length: MAX_FETCH_ORIGINS + 1 }, (_, i) => `https://h${i}.example.com`)]
  ])('refuses %s', (_why, fetchOrigins) => {
    expect(parseSecurityPolicy(complete({ fetchOrigins })).ok).toBe(false)
  })

  it('refuses a list that is not one', () => {
    expect(parseSecurityPolicy(complete({ fetchOrigins: 'https://api.example.com' })))
      .toMatchObject({ reason: expect.stringContaining('not a list') })
  })

  it('refuses a policy that omits it', () => {
    const without = complete() as Record<string, unknown>
    delete without.fetchOrigins

    expect(parseSecurityPolicy(without).ok).toBe(false)
  })

  it('names the offending entry, so an operator can find it', () => {
    expect(parseSecurityPolicy(complete({ fetchOrigins: ['https://ok.example.com', 'nope'] })))
      .toMatchObject({ reason: expect.stringContaining('"nope"') })
  })

  it('does not alias the payload it was read from', () => {
    // A caller mutating the list afterwards would otherwise change what was validated.
    const payload = complete({ fetchOrigins: ['https://api.example.com'] }) as { fetchOrigins: string[] }
    const parsed = parseSecurityPolicy(payload)
    payload.fetchOrigins.push('https://sneaked.example.com')

    expect(parsed.ok && parsed.policy.fetchOrigins).toEqual(['https://api.example.com'])
  })
})

describe('guardCeilings', () => {
  it('lifts out the three ceilings and nothing else', () => {
    // Not the whole policy: what gets signed into an artifact is these three numbers, and passing a
    // policy would put a key rotation interval inside a component's payload.
    expect(guardCeilings(policy(90))).toEqual(CEILINGS)
  })
})

describe('isRotationDue', () => {
  const created = 1_000_000

  it('is false before the interval elapses', () => {
    expect(isRotationDue(policy(90), created, created + 89 * DAY_MS)).toBe(false)
  })

  it('is true once it has', () => {
    expect(isRotationDue(policy(90), created, created + 90 * DAY_MS)).toBe(true)
  })

  it('stays true afterwards', () => {
    expect(isRotationDue(policy(90), created, created + 400 * DAY_MS)).toBe(true)
  })

  it('is false for a key created moments ago', () => {
    expect(isRotationDue(policy(1), created, created + 1)).toBe(false)
  })

  it('does not fire on a clock that runs backwards', () => {
    // A skewed or corrected clock must not trigger a rotation on every signature.
    expect(isRotationDue(policy(90), created, created - 10 * DAY_MS)).toBe(false)
  })
})
