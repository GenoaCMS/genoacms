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
  type SecurityPolicy
} from './policy'

const CEILINGS = { maxFuel: 1_000_000, maxDepth: 100, maxAllocation: 10_000_000 }

const policy = (days: number): SecurityPolicy =>
  ({ subordinateKeyRotationDays: days, accessTokenMinutes: 15, grantCacheSeconds: 30, refreshTokenDays: 14, ...CEILINGS })
const complete = (over: Record<string, unknown> = {}): unknown =>
  ({ subordinateKeyRotationDays: 90, accessTokenMinutes: 15, grantCacheSeconds: 30, refreshTokenDays: 14, ...CEILINGS, ...over })
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
    expect(parseSecurityPolicy({ subordinateKeyRotationDays: 90, grantCacheSeconds: 30, refreshTokenDays: 14, ...CEILINGS }).ok).toBe(false)
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
    expect(parseSecurityPolicy({ subordinateKeyRotationDays: 90, accessTokenMinutes: 15, refreshTokenDays: 14, ...CEILINGS }).ok).toBe(false)
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

describe('guardCeilings', () => {
  it('translates the policy into what a component is bounded by', () => {
    // The two vocabularies are deliberately different: a policy names ceilings, a component has
    // only budgets.
    expect(guardCeilings(policy(90))).toEqual({ fuel: 1_000_000, depth: 100, allocation: 10_000_000 })
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
