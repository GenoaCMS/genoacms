import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WILDCARD, type Grant } from '$lib/script/authorization/grants'
import type { Permission } from '$lib/script/authorization/permissions'

/**
 * The gated signing service.
 *
 * The permission mapping itself is E6's business; what is asserted here is the behavior the matrix
 * cannot see — that a refusal comes back as a reason rather than an exception, that revoking twice
 * is refused before anything is published, and that an unreadable registry is reported rather than
 * replaced.
 */

const registryFixture = {
  sequence: 4,
  current: 'key-current',
  keys: [
    { keyId: 'key-old', alg: 'ML-DSA-65', publicKey: 'AA==', createdAt: 1, supersededAt: 2 },
    { keyId: 'key-gone', alg: 'ML-DSA-65', publicKey: 'CC==', createdAt: 1, revokedAt: 5 },
    { keyId: 'key-current', alg: 'ML-DSA-65', publicKey: 'BB==', createdAt: 2 }
  ]
}

const getRegistry = vi.fn(async () => registryFixture)
const rotateSubordinateKey = vi.fn(async () => registryFixture)
const revokeSubordinateKey = vi.fn(async (_keyId: string) => registryFixture)
const loadSecurityPolicy = vi.fn(async () => ({
  subordinateKeyRotationDays: 90,
  accessTokenMinutes: 15,
  grantCacheSeconds: 30,
  refreshTokenDays: 14
}))

vi.mock('$lib/script/signing/keyResolution.server', () => ({
  getRegistry: async () => await getRegistry(),
  rotateSubordinateKey: async () => await rotateSubordinateKey(),
  revokeSubordinateKey: async (keyId: string) => await revokeSubordinateKey(keyId)
}))

vi.mock('$lib/script/signing/rootKey.server', () => ({
  getRootPublicKey: async () => ({ keyId: 'root-1', alg: 'SLH-DSA-SHA2-128s', publicKey: 'RR==' })
}))

vi.mock('$lib/script/securityPolicy/policy.server', () => ({
  loadSecurityPolicy: async () => await loadSecurityPolicy()
}))

const { createAuthContext } = await import('$lib/script/authorization/context')
const { PermissionDeniedError } = await import('$lib/script/authorization/enforce')
const {
  listUserSigningKeys,
  rotateUserSubordinateKey,
  revokeUserSubordinateKey
} = await import('./user.server')

const holding = (...permissions: Permission[]) =>
  createAuthContext('subject-1', permissions.map(permission => ({ permission, resource: WILDCARD } as Grant)))

const administrator = () => holding('config:keys:manage')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('permission', () => {
  it('refuses every operation to a principal without config:keys:manage', async () => {
    // Including reading. The registry is published, but this screen is the administrative view of
    // it, and the check is what the E6 matrix asserts against every role.
    const outsider = holding('config:roles:manage')

    await expect(listUserSigningKeys(outsider)).rejects.toThrow(PermissionDeniedError)
    await expect(rotateUserSubordinateKey(outsider)).rejects.toThrow(PermissionDeniedError)
    await expect(revokeUserSubordinateKey(outsider, 'key-old')).rejects.toThrow(PermissionDeniedError)
  })

  it('does not touch the registry when it refuses', async () => {
    await expect(rotateUserSubordinateKey(holding())).rejects.toThrow(PermissionDeniedError)

    expect(rotateSubordinateKey).not.toHaveBeenCalled()
  })
})

describe('listing', () => {
  it('reports the anchor, the keys and the interval', async () => {
    const result = await listUserSigningKeys(administrator())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.root.keyId).toBe('root-1')
    expect(result.value.sequence).toBe(4)
    expect(result.value.keys[0].keyId).toBe('key-current')
    expect(result.value.rotation).toEqual({ days: 90, dueAt: 2 + 90 * 24 * 60 * 60 * 1000 })
  })

  it('reports an unreadable registry rather than an empty one', async () => {
    // The difference between "nothing is signing" and "the document does not verify" is the whole
    // reason someone opens this screen.
    getRegistry.mockRejectedValueOnce(new Error('registry/unusable: registry-signature'))

    const result = await listUserSigningKeys(administrator())

    expect(result).toEqual({ ok: false, reason: 'registry/unusable: registry-signature' })
  })

  it('drops the interval rather than guessing when the policy will not load', async () => {
    // A date derived from an interval this instance is not applying reads as a promise about when a
    // key stops being used.
    loadSecurityPolicy.mockRejectedValueOnce(new Error('policy unreadable'))

    const result = await listUserSigningKeys(administrator())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rotation).toBeUndefined()
    expect(result.value.keys).toHaveLength(3)
  })
})

describe('rotating', () => {
  it('returns the key new signatures will be made with', async () => {
    const result = await rotateUserSubordinateKey(administrator())

    expect(result).toEqual({ ok: true, value: { keyId: 'key-current' } })
    expect(rotateSubordinateKey).toHaveBeenCalledOnce()
  })
})

describe('revoking', () => {
  it('revokes a key the registry lists', async () => {
    const result = await revokeUserSubordinateKey(administrator(), 'key-old')

    expect(result.ok).toBe(true)
    expect(revokeSubordinateKey).toHaveBeenCalledWith('key-old')
  })

  it('refuses a key the registry does not list, without publishing', async () => {
    const result = await revokeUserSubordinateKey(administrator(), 'key-imaginary')

    expect(result).toEqual({ ok: false, reason: 'key/unknown: key-imaginary' })
    expect(revokeSubordinateKey).not.toHaveBeenCalled()
  })

  it('refuses a second revocation of the same key', async () => {
    // Publishing again would spend a sequence number and a root signature to say what the previous
    // registry already said.
    const result = await revokeUserSubordinateKey(administrator(), 'key-gone')

    expect(result).toEqual({ ok: false, reason: 'key/already-revoked: key-gone' })
    expect(revokeSubordinateKey).not.toHaveBeenCalled()
  })

  it('reports a failed publication rather than throwing', async () => {
    revokeSubordinateKey.mockRejectedValueOnce(new Error('manifest/conflict'))

    const result = await revokeUserSubordinateKey(administrator(), 'key-old')

    expect(result).toEqual({ ok: false, reason: 'manifest/conflict' })
  })
})
