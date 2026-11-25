import { sha256 } from '@noble/hashes/sha2.js'
import { fromBase64 } from './envelope.js'
import type { JsonValue } from './canonical.js'

/**
 * The key manifest and the key files it binds (REG-1, REG-2).
 *
 * A single bad entry rejects the **whole** manifest. Keeping the entries that happen to validate
 * would let whoever corrupted one choose which keys survive.
 */

/** A key the manifest lists. Its public key is in its key file, bound by `digest`. */
interface RegistryKey {
  keyId: string
  alg: 'ML-DSA-65'
  /** The lowercase hexadecimal SHA-256 of the raw public key. */
  digest: string
  createdAt: number
  supersededAt?: number
  revokedAt?: number
}

interface KeyRegistry {
  sequence: number
  current: string
  keys: RegistryKey[]
}

/** A key file, `.genoacms/keys/public/<keyId>.json`, as it is stored (REG-2). */
interface KeyFile {
  keyId: string
  alg: 'ML-DSA-65'
  publicKey: string
}

/** The public key a key file holds, once it matches its entry. */
interface ResolvedKey {
  alg: 'ML-DSA-65'
  publicKey: Uint8Array
}

const KEY_REGISTRY_DOCUMENT = 'genoacms.keyRegistry.v2'

const SUBORDINATE_ALGORITHM = 'ML-DSA-65'
const MANIFEST_MEMBERS = ['sequence', 'current', 'keys']
const ENTRY_MEMBERS = ['keyId', 'alg', 'digest', 'createdAt', 'supersededAt', 'revokedAt']
const KEY_FILE_MEMBERS = ['keyId', 'alg', 'publicKey']
const DIGEST = /^[0-9a-f]{64}$/

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')

const digestOf = (publicKey: Uint8Array): string => toHex(sha256(publicKey))

/**
 * `keyId = SHA-256(publicKey)`, lowercase hex, first 16 characters (ENV-4).
 */
const deriveKeyId = (publicKey: Uint8Array): string => digestOf(publicKey).slice(0, 16)

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0

const isMoment = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const unexpectedMember = (candidate: Record<string, unknown>, allowed: string[]): string | undefined =>
  Object.keys(candidate).find(name => !allowed.includes(name))

const rejectMoments = (candidate: Record<string, unknown>, keyId: string): string | undefined => {
  if (candidate.createdAt === undefined) return `registry-entry-missing-created-at: ${keyId}`
  for (const member of ['createdAt', 'supersededAt', 'revokedAt']) {
    if (member in candidate && !isMoment(candidate[member])) return `registry-entry-moment-invalid: ${keyId} ${member}`
  }
  return undefined
}

const rejectEntry = (candidate: Record<string, unknown>): string | undefined => {
  const { keyId, alg, digest } = candidate
  if (typeof keyId !== 'string' || keyId.length === 0) return 'registry-entry-missing-key-id'
  const unexpected = unexpectedMember(candidate, ENTRY_MEMBERS)
  if (unexpected !== undefined) return `registry-entry-unexpected-member: ${keyId} ${unexpected}`
  if (alg !== SUBORDINATE_ALGORITHM) return `registry-entry-wrong-algorithm: ${keyId} ${String(alg)}`
  if (typeof digest !== 'string' || !DIGEST.test(digest)) return `registry-entry-digest-malformed: ${keyId}`
  if (!digest.startsWith(keyId)) return `registry-entry-digest-mismatch: ${keyId}`
  return rejectMoments(candidate, keyId)
}

const readKey = (candidate: unknown): RegistryKey | string => {
  if (!isPlainObject(candidate)) return 'registry-entry-not-an-object'
  return rejectEntry(candidate) ?? candidate as unknown as RegistryKey
}

const readKeys = (candidates: unknown[]): RegistryKey[] | string => {
  const read: RegistryKey[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const key = readKey(candidate)
    if (typeof key === 'string') return key
    if (seen.has(key.keyId)) return `registry-duplicate-key-id: ${key.keyId}`
    seen.add(key.keyId)
    read.push(key)
  }
  return read
}

const rejectHeader = (payload: Record<string, unknown>): string | undefined => {
  const unexpected = unexpectedMember(payload, MANIFEST_MEMBERS)
  if (unexpected !== undefined) return `registry-unexpected-member: ${unexpected}`
  const { sequence, current, keys } = payload
  if (!isPositiveInteger(sequence)) return 'registry-sequence-not-a-positive-integer'
  if (typeof current !== 'string' || current.length === 0) return 'registry-missing-current'
  if (!Array.isArray(keys)) return 'registry-keys-not-an-array'
  if (keys.length === 0) return 'registry-keys-empty'
  return undefined
}

const rejectCurrent = (keys: RegistryKey[], current: string): string | undefined => {
  const currentKey = keys.find(key => key.keyId === current)
  if (currentKey === undefined) return `registry-current-not-listed: ${current}`
  if (currentKey.revokedAt !== undefined) return `registry-current-revoked: ${current}`
  if (currentKey.supersededAt !== undefined) return `registry-current-superseded: ${current}`
  return undefined
}

/** VFY-3: a verified manifest payload by every rule of REG-1, or the first rule it breaks. */
const readRegistry = (payload: JsonValue): KeyRegistry | string => {
  if (!isPlainObject(payload)) return 'registry-not-an-object'
  const header = rejectHeader(payload)
  if (header !== undefined) return header

  const keys = readKeys(payload.keys as unknown[])
  if (typeof keys === 'string') return keys
  const current = payload.current as string
  const rejected = rejectCurrent(keys, current)
  if (rejected !== undefined) return rejected

  return { sequence: payload.sequence as number, current, keys }
}

const keyFileMismatch = (entry: RegistryKey, member: string): string =>
  `key-file-mismatch: ${entry.keyId} ${member} does not match the key manifest`

const publicKeyMatching = (entry: RegistryKey, encoded: unknown): Uint8Array | undefined => {
  if (typeof encoded !== 'string') return undefined
  const publicKey = fromBase64(encoded)
  if (publicKey === undefined) return undefined
  return digestOf(publicKey) === entry.digest ? publicKey : undefined
}

const hasExactlyTheMembers = (candidate: unknown): candidate is Record<string, unknown> =>
  isPlainObject(candidate) &&
  Object.keys(candidate).length === KEY_FILE_MEMBERS.length &&
  KEY_FILE_MEMBERS.every(name => name in candidate)

/** REG-2: the key a listed entry's file holds, or the first member that does not match. */
const readKeyFile = (entry: RegistryKey, candidate: unknown): ResolvedKey | string => {
  if (!hasExactlyTheMembers(candidate)) return keyFileMismatch(entry, 'shape')
  if (candidate.keyId !== entry.keyId) return keyFileMismatch(entry, 'keyId')
  if (candidate.alg !== entry.alg) return keyFileMismatch(entry, 'alg')
  const publicKey = publicKeyMatching(entry, candidate.publicKey)
  if (publicKey === undefined) return keyFileMismatch(entry, 'publicKey')
  return { alg: entry.alg, publicKey }
}

export { KEY_REGISTRY_DOCUMENT, deriveKeyId, readRegistry, readKeyFile }
export type { KeyRegistry, RegistryKey, KeyFile, ResolvedKey }
