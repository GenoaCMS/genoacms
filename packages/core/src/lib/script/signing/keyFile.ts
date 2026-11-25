import { getAlgorithm, SUBORDINATE_ALGORITHM } from './algorithms'
import { fromBase64, toBase64, type VerificationKey } from './envelope'
import { digestOf, type RegisteredKey } from './registry'

/** A key file, `.genoacms/keys/public/<keyId>.json` (REG-2). */
interface KeyFile {
  keyId: string
  alg: 'ML-DSA-65'
  publicKey: string
}

type KeyFileParseResult =
  | { ok: true, key: VerificationKey }
  | { ok: false, reason: string }

const MEMBERS = ['keyId', 'alg', 'publicKey']

/** REG-2 */
function keyFilePath (keyId: string): string {
  return `.genoacms/keys/public/${keyId}.json`
}

/** REG-2, REG-3: members in the order a stored file has them. */
function toKeyFile (keyId: string, alg: 'ML-DSA-65', publicKey: Uint8Array): KeyFile {
  return { keyId, alg, publicKey: toBase64(publicKey) }
}

function hasExactlyTheMembers (candidate: unknown): candidate is Record<string, unknown> {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return false
  const names = Object.keys(candidate)
  return names.length === MEMBERS.length && MEMBERS.every(name => names.includes(name))
}

function publicKeyMatching (entry: RegisteredKey, encoded: unknown): Uint8Array | undefined {
  if (typeof encoded !== 'string') return undefined
  const publicKey = fromBase64(encoded)
  if (publicKey === undefined) return undefined
  if (publicKey.length !== getAlgorithm(SUBORDINATE_ALGORITHM).lengths.publicKey) return undefined
  return digestOf(publicKey) === entry.digest ? publicKey : undefined
}

function mismatch (entry: RegisteredKey, member: string): KeyFileParseResult {
  return { ok: false, reason: `key-file-mismatch: ${entry.keyId} ${member} does not match the key manifest` }
}

/** REG-2: the key a listed entry's file holds, or the first member that does not match. */
function parseKeyFile (entry: RegisteredKey, candidate: unknown): KeyFileParseResult {
  if (!hasExactlyTheMembers(candidate)) return mismatch(entry, 'shape')
  if (candidate.keyId !== entry.keyId) return mismatch(entry, 'keyId')
  if (candidate.alg !== entry.alg) return mismatch(entry, 'alg')
  const publicKey = publicKeyMatching(entry, candidate.publicKey)
  if (publicKey === undefined) return mismatch(entry, 'publicKey')
  return { ok: true, key: { alg: entry.alg, publicKey } }
}

export {
  keyFilePath,
  toKeyFile,
  parseKeyFile
}

export type {
  KeyFile,
  KeyFileParseResult
}
