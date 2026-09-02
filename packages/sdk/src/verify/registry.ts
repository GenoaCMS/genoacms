import { sha256 } from '@noble/hashes/sha2.js'
import { isAlgorithmName } from './algorithms.js'
import { fromBase64 } from './envelope.js'
import type { JsonValue } from './canonical.js'

/**
 * The key registry: what it must satisfy before any key in it is used.
 *
 * Every rule here is one an attacker would like relaxed, and the specification is explicit that a
 * single bad entry rejects the **whole** registry. Keeping the entries that happen to validate would
 * let whoever corrupted one choose which keys survive.
 */

interface RegistryKey {
  keyId: string
  alg: string
  publicKey: string
  createdAt: number
  supersededAt?: number
  revokedAt?: number
}

interface KeyRegistry {
  sequence: number
  current: string
  keys: RegistryKey[]
}

const KEY_REGISTRY_DOCUMENT = 'genoacms.keyRegistry.v1'

/**
 * `keyId = SHA-256(publicKey)`, lowercase hex, first 16 characters.
 *
 * Derived, never taken on trust. This is what stops a tampered registry from publishing an
 * attacker's key under an id that existing documents already reference — the id and the key are the
 * same fact stated twice, and they have to agree.
 */
const deriveKeyId = (publicKey: Uint8Array): string =>
  [...sha256(publicKey)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16)

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0

const readKey = (candidate: unknown): RegistryKey | string => {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return 'registry-entry-not-an-object'
  }
  const { keyId, alg, publicKey, createdAt, supersededAt, revokedAt } =
    candidate as Record<string, unknown>

  if (typeof keyId !== 'string' || keyId.length === 0) return 'registry-entry-missing-key-id'
  if (!isAlgorithmName(alg)) return `registry-entry-unknown-algorithm: ${String(alg)}`
  if (typeof publicKey !== 'string') return `registry-entry-missing-public-key: ${keyId}`
  if (typeof createdAt !== 'number') return `registry-entry-missing-created-at: ${keyId}`

  const decoded = fromBase64(publicKey)
  if (decoded === undefined) return `registry-entry-public-key-not-base64: ${keyId}`
  if (deriveKeyId(decoded) !== keyId) return `registry-entry-key-id-mismatch: ${keyId}`

  return {
    keyId,
    alg,
    publicKey,
    createdAt,
    ...(typeof supersededAt === 'number' ? { supersededAt } : {}),
    ...(typeof revokedAt === 'number' ? { revokedAt } : {})
  }
}

/** Validates a verified registry payload. Returns the registry, or the reason it is refused. */
const readRegistry = (payload: JsonValue): KeyRegistry | string => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return 'registry-not-an-object'
  }
  const { sequence, current, keys } = payload as Record<string, unknown>

  if (!isPositiveInteger(sequence)) return 'registry-sequence-not-a-positive-integer'
  if (typeof current !== 'string' || current.length === 0) return 'registry-missing-current'
  if (!Array.isArray(keys)) return 'registry-keys-not-an-array'

  const read: RegistryKey[] = []
  const seen = new Set<string>()
  for (const candidate of keys) {
    const key = readKey(candidate)
    if (typeof key === 'string') return key
    // A duplicate id makes resolution ambiguous, and an attacker chooses which one wins.
    if (seen.has(key.keyId)) return `registry-duplicate-key-id: ${key.keyId}`
    seen.add(key.keyId)
    read.push(key)
  }

  const currentKey = read.find(key => key.keyId === current)
  if (currentKey === undefined) return `registry-current-not-listed: ${current}`
  if (currentKey.revokedAt !== undefined) return `registry-current-revoked: ${current}`
  if (currentKey.supersededAt !== undefined) return `registry-current-superseded: ${current}`

  return { sequence, current, keys: read }
}

/**
 * The public key for an id, or `undefined` when it must not be trusted.
 *
 * **`supersededAt` does not prevent resolution; `revokedAt` does.** A superseded key was rotated for
 * hygiene and everything it signed stays valid — refusing it would invalidate every document written
 * before the last rotation. A revoked key is one whose private half is not trusted, so nothing it
 * signed is either, including documents signed before the revocation. Confusing the two breaks the
 * instance in one direction or accepts forgeries in the other.
 */
const resolveKey = (registry: KeyRegistry, keyId: string): Uint8Array | undefined => {
  const key = registry.keys.find(entry => entry.keyId === keyId)
  if (key === undefined || key.revokedAt !== undefined) return undefined
  return fromBase64(key.publicKey)
}

export { KEY_REGISTRY_DOCUMENT, deriveKeyId, readRegistry, resolveKey }
export type { KeyRegistry, RegistryKey }
