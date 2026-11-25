import { sha256 } from '@noble/hashes/sha2.js'
import { SUBORDINATE_ALGORITHM } from './algorithms'
import type { JsonValue } from './canonical'

/** A key the manifest lists (REG-1). */
interface RegisteredKey {
  keyId: string
  alg: 'ML-DSA-65'
  /** The lowercase hexadecimal SHA-256 of the raw public key. */
  digest: string
  createdAt: number
  supersededAt?: number
  revokedAt?: number
}

/** The payload of `.genoacms/keys/public.json` (REG-1). */
interface KeyManifest {
  sequence: number
  current: string
  keys: RegisteredKey[]
}

type ManifestParseResult =
  | { ok: true, manifest: KeyManifest }
  | { ok: false, reason: string }

const DIGEST = /^[0-9a-f]{64}$/

function isPlainObject (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMoment (value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function toHex (bytes: Uint8Array): string {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** REG-1 */
function digestOf (publicKey: Uint8Array): string {
  return toHex(sha256(publicKey))
}

function unexpectedFields (rest: Record<string, unknown>): string | undefined {
  const names = Object.keys(rest)
  return names.length === 0 ? undefined : names.join(', ')
}

function rejectMoments (value: Record<string, unknown>, index: number): string | undefined {
  if (!isMoment(value.createdAt)) return `keys[${index}].createdAt is not a timestamp`
  if (value.supersededAt !== undefined && !isMoment(value.supersededAt)) return `keys[${index}].supersededAt must be a timestamp or omitted`
  if (value.revokedAt !== undefined && !isMoment(value.revokedAt)) return `keys[${index}].revokedAt must be a timestamp or omitted`
  return undefined
}

function rejectEntry (value: Record<string, unknown>, index: number): string | undefined {
  const { keyId, alg, digest, createdAt, supersededAt, revokedAt, ...rest } = value
  const unexpected = unexpectedFields(rest)
  if (unexpected !== undefined) return `keys[${index}] has unexpected fields: ${unexpected}`
  if (typeof keyId !== 'string' || keyId.length === 0) return `keys[${index}].keyId is missing`
  if (alg !== SUBORDINATE_ALGORITHM) return `keys[${index}].alg must be ${SUBORDINATE_ALGORITHM}, not ${String(alg)}`
  if (typeof digest !== 'string' || !DIGEST.test(digest)) return `keys[${index}].digest is not 64 lowercase hexadecimal characters`
  if (!digest.startsWith(keyId)) return `keys[${index}].digest does not begin with its keyId`
  return rejectMoments({ createdAt, supersededAt, revokedAt }, index)
}

function toEntry (value: Record<string, unknown>): RegisteredKey {
  const entry: RegisteredKey = {
    keyId: value.keyId as string,
    alg: 'ML-DSA-65',
    digest: value.digest as string,
    createdAt: value.createdAt as number
  }
  if (value.supersededAt !== undefined) entry.supersededAt = value.supersededAt as number
  if (value.revokedAt !== undefined) entry.revokedAt = value.revokedAt as number
  return entry
}

function parseEntry (value: unknown, index: number): RegisteredKey | string {
  if (!isPlainObject(value)) return `keys[${index}] is not an object`
  return rejectEntry(value, index) ?? toEntry(value)
}

function parseEntries (keys: unknown[]): RegisteredKey[] | string {
  const parsed: RegisteredKey[] = []
  for (const [index, value] of keys.entries()) {
    const entry = parseEntry(value, index)
    if (typeof entry === 'string') return entry
    parsed.push(entry)
  }
  return parsed
}

function rejectDuplicates (keys: RegisteredKey[]): string | undefined {
  const seen = new Set<string>()
  for (const entry of keys) {
    if (seen.has(entry.keyId)) return `registry lists ${entry.keyId} twice`
    seen.add(entry.keyId)
  }
  return undefined
}

function rejectCurrent (keys: RegisteredKey[], current: string): string | undefined {
  const entry = keys.find(key => key.keyId === current)
  if (entry === undefined) return `registry.current ${current} is not among its keys`
  if (entry.supersededAt !== undefined) return `registry.current ${current} is marked superseded`
  if (entry.revokedAt !== undefined) return `registry.current ${current} is revoked`
  return undefined
}

function rejectHeader (payload: Record<string, unknown>): string | undefined {
  const { sequence, current, keys, ...rest } = payload
  const unexpected = unexpectedFields(rest)
  if (unexpected !== undefined) return `registry has unexpected fields: ${unexpected}`
  if (!isMoment(sequence) || sequence < 1) return 'registry.sequence is not a positive integer'
  if (typeof current !== 'string' || current.length === 0) return 'registry.current is missing'
  if (!Array.isArray(keys)) return 'registry.keys is not an array'
  if (keys.length === 0) return 'registry.keys is empty'
  return undefined
}

/** REG-1: the manifest accepted whole, or the first rule it breaks. */
function parseKeyManifest (payload: unknown): ManifestParseResult {
  if (!isPlainObject(payload)) return { ok: false, reason: 'registry is not an object' }
  const header = rejectHeader(payload)
  if (header !== undefined) return { ok: false, reason: header }

  const keys = parseEntries(payload.keys as unknown[])
  if (typeof keys === 'string') return { ok: false, reason: keys }
  const current = payload.current as string
  const rejected = rejectDuplicates(keys) ?? rejectCurrent(keys, current)
  if (rejected !== undefined) return { ok: false, reason: rejected }

  return { ok: true, manifest: { sequence: payload.sequence as number, current, keys } }
}

function findKey (manifest: KeyManifest, keyId: string): RegisteredKey | undefined {
  return manifest.keys.find(entry => entry.keyId === keyId)
}

function isRevoked (entry: RegisteredKey): boolean {
  return entry.revokedAt !== undefined
}

function currentKey (manifest: KeyManifest): RegisteredKey {
  const entry = findKey(manifest, manifest.current)
  if (entry === undefined) throw new Error('registry/current-missing')
  return entry
}

/** REG-3, REG-4 */
function withRotatedKey (manifest: KeyManifest, entry: Omit<RegisteredKey, 'supersededAt'>, at: number): KeyManifest {
  const keys = manifest.keys.map(existing => existing.keyId === manifest.current && existing.supersededAt === undefined
    ? { ...existing, supersededAt: at }
    : existing)
  return { sequence: manifest.sequence + 1, current: entry.keyId, keys: [...keys, entry] }
}

/** REG-3, REG-4, KEY-4 */
function withRevokedKey (manifest: KeyManifest, keyId: string, at: number): KeyManifest {
  if (keyId === manifest.current) {
    throw new Error(`registry/cannot-revoke-current: rotate away from ${keyId} before revoking it`)
  }
  if (findKey(manifest, keyId) === undefined) {
    throw new Error(`registry/unknown-key: ${keyId}`)
  }
  return {
    sequence: manifest.sequence + 1,
    current: manifest.current,
    keys: manifest.keys.map(entry => entry.keyId === keyId && entry.revokedAt === undefined
      ? { ...entry, revokedAt: at }
      : entry)
  }
}

function toPayload (manifest: KeyManifest): JsonValue {
  return manifest as unknown as JsonValue
}

export {
  parseKeyManifest,
  digestOf,
  findKey,
  isRevoked,
  currentKey,
  withRotatedKey,
  withRevokedKey,
  toPayload
}

export type {
  KeyManifest,
  RegisteredKey,
  ManifestParseResult
}
