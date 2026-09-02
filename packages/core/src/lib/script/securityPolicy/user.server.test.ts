import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WILDCARD, type Grant } from '$lib/script/authorization/grants'
import type { Permission } from '$lib/script/authorization/permissions'

/**
 * The gated security policy.
 *
 * What is asserted here is what the permission matrix cannot see: that a refusal comes back as a
 * reason rather than an exception, that an out-of-range value is rejected before anything is signed,
 * and that a document someone else moved is reported instead of overwritten.
 */

const POLICY = {
  subordinateKeyRotationDays: 90,
  accessTokenMinutes: 15,
  grantCacheSeconds: 30,
  refreshTokenDays: 14,
  maxFuel: 1_000_000,
  maxDepth: 100,
  maxAllocation: 10_000_000,
  fetchOrigins: ['https://api.example.com']
}

const readStoredPolicy = vi.fn(async () => ({ policy: POLICY, version: 'v1' }) as {
  policy: typeof POLICY, version?: string, degraded?: string
})
const writePolicy = vi.fn(async (_policy: unknown, _expected?: string) => undefined)

class PreconditionFailed extends Error {}

vi.mock('$lib/script/securityPolicy/policy.server', () => ({
  readStoredPolicy: async () => await readStoredPolicy(),
  writePolicy: async (policy: unknown, expected?: string) => await writePolicy(policy, expected)
}))

vi.mock('@genoacms/cloudabstraction/storage', () => ({
  isPreconditionFailed: (error: unknown) => error instanceof PreconditionFailed
}))

const { createAuthContext } = await import('$lib/script/authorization/context')
const { PermissionDeniedError } = await import('$lib/script/authorization/enforce')
const { readUserSecurityPolicy, updateUserSecurityPolicy } = await import('./user.server')

const holding = (...permissions: Permission[]) =>
  createAuthContext('subject-1', permissions.map(permission => ({ permission, resource: WILDCARD } as Grant)))

const administrator = () => holding('config:security:manage')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('permission', () => {
  it.each([
    ['reading', async () => await readUserSecurityPolicy(holding('config:keys:manage'))],
    ['writing', async () => await updateUserSecurityPolicy(holding('config:keys:manage'), POLICY, 'v1')]
  ])('refuses %s to a principal without config:security:manage', async (_what, act) => {
    await expect(act()).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it('writes nothing when it refuses', async () => {
    await updateUserSecurityPolicy(holding(), POLICY, 'v1').catch(() => undefined)

    expect(writePolicy).not.toHaveBeenCalled()
  })
})

describe('reading it for a screen', () => {
  it('carries the version a write has to quote', async () => {
    const result = await readUserSecurityPolicy(administrator())

    expect(result.ok && result.value.version).toBe('v1')
  })

  it('carries the range of every field that has one', async () => {
    // A screen offering a range the parser disagrees with teaches an administrator that the screen
    // is lying, rather than that the value was wrong. The allowlist has no range — it is a list of
    // origins, refused entry by entry — so it is absent here rather than given a meaningless pair.
    const result = await readUserSecurityPolicy(administrator())

    expect(result.ok && Object.keys(result.value.bounds).sort())
      .toEqual(Object.keys(POLICY).filter(field => field !== 'fetchOrigins').sort())
  })

  it('says when it is showing configured defaults rather than the stored document', async () => {
    readStoredPolicy.mockResolvedValueOnce({ policy: POLICY, version: 'v1', degraded: 'not JSON' })

    const result = await readUserSecurityPolicy(administrator())

    expect(result.ok && result.value.degraded).toBe('not JSON')
  })

  it('says nothing about degradation when the document was read', async () => {
    const result = await readUserSecurityPolicy(administrator())

    expect(result.ok && 'degraded' in result.value).toBe(false)
  })
})

describe('writing it back', () => {
  it('stores a policy the parser accepts', async () => {
    const result = await updateUserSecurityPolicy(administrator(), { ...POLICY, maxDepth: 50 }, 'v1')

    expect(result.ok).toBe(true)
    expect(writePolicy).toHaveBeenCalledWith({ ...POLICY, maxDepth: 50 }, 'v1')
  })

  it.each([
    ['a ceiling below its minimum', { maxDepth: 1 }],
    ['a ceiling above its maximum', { maxFuel: 2_000_000_000 }],
    ['a fractional value', { maxAllocation: 1.5 }],
    ['a rotation interval nobody could have meant', { subordinateKeyRotationDays: 5_000 }],
    ['an allowlist entry that is not an origin', { fetchOrigins: ['api.example.com'] }]
  ])('refuses %s, and signs nothing', async (_why, over) => {
    const result = await updateUserSecurityPolicy(administrator(), { ...POLICY, ...over }, 'v1')

    expect(result.ok).toBe(false)
    expect(writePolicy).not.toHaveBeenCalled()
  })

  it('rejects rather than clamping', async () => {
    // An administrator who wrote 5000 days meant something. Quietly storing 365 would leave the
    // instance behaving differently from the screen they are looking at.
    const result = await updateUserSecurityPolicy(
      administrator(), { ...POLICY, subordinateKeyRotationDays: 5_000 }, 'v1'
    )

    expect(result.ok && (result.value as { subordinateKeyRotationDays: number })).toBeFalsy()
  })

  it('names the field it refused', async () => {
    const result = await updateUserSecurityPolicy(administrator(), { ...POLICY, maxDepth: 0 }, 'v1')

    expect(!result.ok && result.reason).toContain('policy.maxDepth')
  })

  it('reports a document someone else moved, rather than overwriting it', async () => {
    writePolicy.mockRejectedValueOnce(new PreconditionFailed('version mismatch'))

    const result = await updateUserSecurityPolicy(administrator(), POLICY, 'v1')

    expect(!result.ok && result.reason).toContain('changed by someone else')
  })

  it('passes an absent version through, which is how a first write creates the document', async () => {
    await updateUserSecurityPolicy(administrator(), POLICY, undefined)

    expect(writePolicy).toHaveBeenCalledWith(POLICY, undefined)
  })

  it('reports any other storage failure as itself', async () => {
    writePolicy.mockRejectedValueOnce(new Error('bucket unreachable'))

    const result = await updateUserSecurityPolicy(administrator(), POLICY, 'v1')

    expect(!result.ok && result.reason).toBe('bucket unreachable')
  })
})
