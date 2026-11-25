import { describe, it, expect } from 'vitest'
import { getAlgorithm, SUBORDINATE_ALGORITHM } from '#lib/script/signing/algorithms.js'
import { deriveKeyId } from '#lib/script/signing/keyId.js'
import { sign, verify, peekUnverifiedHeader } from '#lib/script/signing/envelope.js'
import { parseKeyManifest, digestOf, findKey, isRevoked, withRotatedKey, withRevokedKey, type KeyManifest } from '#lib/script/signing/registry.js'
import { parseKeyFile, toKeyFile } from '#lib/script/signing/keyFile.js'
import { parseRolesManifest, serializeRolesManifest } from './manifests'
import type { Role } from './roles'
import type { JsonValue } from '#lib/script/signing/canonical.js'

/**
 * The whole read path composed, minus storage: a manifest signed by a subordinate key, that key
 * resolved through a registry, the signature verified, and the payload parsed. Each piece is tested
 * on its own elsewhere; this asserts they fit.
 */

const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)

const makeKey = (fill: number) => {
  const keypair = algorithm.generateKeypair(new Uint8Array(algorithm.lengths.seed).fill(fill))
  return { keypair, keyId: deriveKeyId(keypair.publicKey) }
}

const signer = makeKey(1)
const successor = makeKey(2)

const entryOf = (key: typeof signer, createdAt: number) =>
  ({ keyId: key.keyId, alg: 'ML-DSA-65' as const, digest: digestOf(key.keypair.publicKey), createdAt })

const keyFiles = new Map([signer, successor].map(key => [key.keyId, toKeyFile(key.keyId, 'ML-DSA-65', key.keypair.publicKey)]))

const registryWith = (...keys: Array<typeof signer>): KeyManifest => {
  const parsed = parseKeyManifest({ sequence: 1, current: keys[0].keyId, keys: keys.map(key => entryOf(key, 1_000)) })
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.manifest
}

const roles: Role[] = [
  { name: 'Editor', grants: [{ permission: 'pages:content_edit', resource: '*' }] }
]

const signedRoles = (key: typeof signer) =>
  sign('genoacms.roles.v1', serializeRolesManifest(roles) as unknown as JsonValue, {
    alg: SUBORDINATE_ALGORITHM,
    keyId: key.keyId,
    secretKey: key.keypair.secretKey
  })

/** What resolution.server does, with storage and the registry supplied directly. */
const readManifest = (candidate: unknown, registry: KeyManifest) => {
  const header = peekUnverifiedHeader(candidate)
  if (header === undefined) return { ok: false as const, reason: 'not an envelope' }
  const entry = findKey(registry, header.keyId)
  if (entry === undefined || isRevoked(entry)) return { ok: false as const, reason: 'key unknown or revoked' }
  const resolution = parseKeyFile(entry, keyFiles.get(entry.keyId))
  if (!resolution.ok) return { ok: false as const, reason: resolution.reason }
  const verified = verify(candidate, 'genoacms.roles.v1', resolution.key)
  if (!verified.valid) return { ok: false as const, reason: verified.reason }
  return parseRolesManifest(verified.payload)
}

describe('a signed manifest end to end', () => {
  it('verifies and parses back to the roles that were written', () => {
    const stored = JSON.parse(JSON.stringify(signedRoles(signer)))
    const result = readManifest(stored, registryWith(signer))
    expect(result).toEqual({ ok: true, value: roles })
  })

  it('still verifies after the signing key is superseded by a rotation', () => {
    // Rotation must not invalidate manifests already written.
    const stored = JSON.parse(JSON.stringify(signedRoles(signer)))
    const rotated = withRotatedKey(registryWith(signer), entryOf(successor, 2_000), 2_000)
    expect(readManifest(stored, rotated).ok).toBe(true)
  })

  it('stops verifying once that key is revoked', () => {
    // And revocation must invalidate them, which is the whole difference between the two states.
    const stored = JSON.parse(JSON.stringify(signedRoles(signer)))
    const rotated = withRotatedKey(registryWith(signer), entryOf(successor, 2_000), 2_000)
    const revoked = withRevokedKey(rotated, signer.keyId, 3_000)
    expect(readManifest(stored, revoked))
      .toMatchObject({ ok: false, reason: expect.stringContaining('unknown or revoked') })
  })

  it('rejects a payload edited after signing', () => {
    const stored = JSON.parse(JSON.stringify(signedRoles(signer)))
    stored.payload.roles.Editor = [{ permission: '*', resource: '*' }]
    expect(readManifest(stored, registryWith(signer)).ok).toBe(false)
  })

  it('rejects a manifest signed by a key the registry never listed', () => {
    const stored = JSON.parse(JSON.stringify(signedRoles(successor)))
    expect(readManifest(stored, registryWith(signer)))
      .toMatchObject({ ok: false, reason: expect.stringContaining('unknown or revoked') })
  })

  it('rejects a bare unsigned manifest, which is no longer a form that exists', () => {
    expect(readManifest(serializeRolesManifest(roles), registryWith(signer)))
      .toMatchObject({ ok: false, reason: 'not an envelope' })
  })

  it('rejects an envelope whose declared type is another document', () => {
    const stored = JSON.parse(JSON.stringify(signedRoles(signer)))
    stored.type = 'genoacms.users.v1'
    expect(readManifest(stored, registryWith(signer)).ok).toBe(false)
  })

  it('round-trips an empty manifest, which is what first start writes', () => {
    const empty = sign('genoacms.roles.v1', { roles: {} }, {
      alg: SUBORDINATE_ALGORITHM, keyId: signer.keyId, secretKey: signer.keypair.secretKey
    })
    const stored = JSON.parse(JSON.stringify(empty))
    expect(readManifest(stored, registryWith(signer))).toEqual({ ok: true, value: [] })
  })
})
