import { isAlgorithmName, getAlgorithm, type AlgorithmName } from './algorithms'
import { matchesKeyId } from './keyId'
import { fromBase64 } from './envelope'
import type { JsonValue } from './canonical'

/**
 * The registry of subordinate public keys, as a value.
 *
 * Kept free of storage and configuration so its rules are testable directly — this is the document
 * that decides which keys a consumer will trust, and every rule below is one an attacker would like
 * to see relaxed.
 */

interface SubordinateKeyEntry {
  keyId: string
  alg: AlgorithmName
  /** base64 */
  publicKey: string
  createdAt: number
  /** Present only once the key has stopped being current. Omitted, never null (§3.6.3). */
  supersededAt?: number
}

interface KeyRegistry {
  /** The key new signatures are made with. A verifier never reads this. */
  current: string
  /** Every key that can still verify — current and superseded alike. */
  keys: SubordinateKeyEntry[]
}

type RegistryParseResult =
  | { ok: true, registry: KeyRegistry }
  | { ok: false, reason: string }

function isPlainObject (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveInteger (value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/**
 * Validates one entry, including that its `keyId` really derives from its `publicKey`.
 *
 * That check is what makes the document self-describing: an entry naming one key while carrying
 * another would otherwise let a tampered registry publish an attacker's key under a `keyId` that
 * existing signed artifacts already reference.
 */
function parseEntry (value: unknown, index: number): SubordinateKeyEntry | string {
  if (!isPlainObject(value)) return `keys[${index}] is not an object`

  const { keyId, alg, publicKey, createdAt, supersededAt, ...rest } = value
  if (Object.keys(rest).length > 0) return `keys[${index}] has unexpected fields: ${Object.keys(rest).join(', ')}`
  if (typeof keyId !== 'string' || keyId.length === 0) return `keys[${index}].keyId is missing`
  if (!isAlgorithmName(alg)) return `keys[${index}].alg is not a known algorithm: ${String(alg)}`
  if (typeof publicKey !== 'string') return `keys[${index}].publicKey is missing`
  if (!isPositiveInteger(createdAt)) return `keys[${index}].createdAt is not a timestamp`
  if (supersededAt !== undefined && !isPositiveInteger(supersededAt)) {
    // `null` lands here too, which is intended: an unset field is omitted, and accepting null would
    // make two documents that mean the same thing produce different digests.
    return `keys[${index}].supersededAt must be a timestamp or omitted`
  }

  const decoded = fromBase64(publicKey)
  if (decoded === undefined) return `keys[${index}].publicKey is not base64`

  const expectedLength = getAlgorithm(alg).lengths.publicKey
  if (decoded.length !== expectedLength) {
    return `keys[${index}].publicKey is ${decoded.length} bytes, expected ${expectedLength} for ${alg}`
  }
  if (!matchesKeyId(decoded, keyId)) {
    return `keys[${index}].keyId does not derive from its publicKey`
  }

  return supersededAt === undefined
    ? { keyId, alg, publicKey, createdAt }
    : { keyId, alg, publicKey, createdAt, supersededAt }
}

/**
 * Parses an untrusted registry payload.
 *
 * Fails whole rather than in part. A registry with one bad entry is a registry that cannot be
 * reasoned about, and keeping the entries that happen to validate would let an attacker who can
 * corrupt one entry choose which keys survive.
 */
function parseKeyRegistry (payload: unknown): RegistryParseResult {
  if (!isPlainObject(payload)) return { ok: false, reason: 'registry is not an object' }

  const { current, keys, ...rest } = payload
  if (Object.keys(rest).length > 0) return { ok: false, reason: `registry has unexpected fields: ${Object.keys(rest).join(', ')}` }
  if (typeof current !== 'string' || current.length === 0) return { ok: false, reason: 'registry.current is missing' }
  if (!Array.isArray(keys)) return { ok: false, reason: 'registry.keys is not an array' }
  if (keys.length === 0) return { ok: false, reason: 'registry.keys is empty' }

  const parsed: SubordinateKeyEntry[] = []
  for (const [index, entry] of keys.entries()) {
    const result = parseEntry(entry, index)
    if (typeof result === 'string') return { ok: false, reason: result }
    parsed.push(result)
  }

  const seen = new Set<string>()
  for (const entry of parsed) {
    if (seen.has(entry.keyId)) return { ok: false, reason: `registry lists ${entry.keyId} twice` }
    seen.add(entry.keyId)
  }

  const currentEntry = parsed.find(entry => entry.keyId === current)
  if (currentEntry === undefined) return { ok: false, reason: `registry.current ${current} is not among its keys` }
  if (currentEntry.supersededAt !== undefined) {
    // A key cannot be both the one to sign with and one that has stopped signing.
    return { ok: false, reason: `registry.current ${current} is marked superseded` }
  }

  return { ok: true, registry: { current, keys: parsed } }
}

function findKey (registry: KeyRegistry, keyId: string): SubordinateKeyEntry | undefined {
  return registry.keys.find(entry => entry.keyId === keyId)
}

/** The decoded public key for a `keyId`, or `undefined` when the registry does not list it. */
function findPublicKey (registry: KeyRegistry, keyId: string): Uint8Array | undefined {
  const entry = findKey(registry, keyId)
  if (entry === undefined) return undefined
  return fromBase64(entry.publicKey)
}

function currentKey (registry: KeyRegistry): SubordinateKeyEntry {
  const entry = findKey(registry, registry.current)
  if (entry === undefined) throw new Error('registry/current-missing')
  return entry
}

/** Appends a new key and marks the outgoing one superseded. Rotation never removes an entry. */
function withRotatedKey (
  registry: KeyRegistry,
  entry: Omit<SubordinateKeyEntry, 'supersededAt'>,
  at: number
): KeyRegistry {
  const keys = registry.keys.map(existing => existing.keyId === registry.current && existing.supersededAt === undefined
    ? { ...existing, supersededAt: at }
    : existing)
  return { current: entry.keyId, keys: [...keys, entry] }
}

function toPayload (registry: KeyRegistry): JsonValue {
  return registry as unknown as JsonValue
}

export {
  parseKeyRegistry,
  findKey,
  findPublicKey,
  currentKey,
  withRotatedKey,
  toPayload
}

export type {
  KeyRegistry,
  SubordinateKeyEntry,
  RegistryParseResult
}
