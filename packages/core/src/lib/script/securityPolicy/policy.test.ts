import { describe, it, expect } from 'vitest'
import {
  parseSecurityPolicy,
  isRotationDue,
  DAY_MS,
  MIN_ROTATION_DAYS,
  MAX_ROTATION_DAYS,
  type SecurityPolicy
} from './policy'

const policy = (days: number): SecurityPolicy => ({ subordinateKeyRotationDays: days })

describe('parseSecurityPolicy', () => {
  it('accepts a policy at the documented default', () => {
    expect(parseSecurityPolicy({ subordinateKeyRotationDays: 90 }))
      .toEqual({ ok: true, policy: policy(90) })
  })

  it.each([MIN_ROTATION_DAYS, MAX_ROTATION_DAYS])('accepts the boundary value %s', (days) => {
    expect(parseSecurityPolicy({ subordinateKeyRotationDays: days }).ok).toBe(true)
  })

  it.each([0, -1, MAX_ROTATION_DAYS + 1, 5000])('rejects the out-of-range value %s', (days) => {
    expect(parseSecurityPolicy({ subordinateKeyRotationDays: days }).ok).toBe(false)
  })

  it.each([1.5, '90', null, undefined, NaN])('rejects the non-integer value %s', (days) => {
    expect(parseSecurityPolicy({ subordinateKeyRotationDays: days }).ok).toBe(false)
  })

  it('rejects a field this version does not know', () => {
    // A document from a newer version. Acting on half of it would mean acting on a policy only
    // half understood — and the unknown half may be the part that tightens something.
    expect(parseSecurityPolicy({ subordinateKeyRotationDays: 90, maxFuel: 1000 }))
      .toMatchObject({ ok: false, reason: expect.stringContaining('unexpected fields') })
  })

  it.each([null, 'a string', 42, []])('rejects the non-policy value %s', (value) => {
    expect(parseSecurityPolicy(value).ok).toBe(false)
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
