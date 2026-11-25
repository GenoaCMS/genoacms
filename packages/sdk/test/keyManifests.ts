import { slh_dsa_sha2_128s as rootScheme } from '@noble/post-quantum/slh-dsa.js'
import { ml_dsa65 as subordinateScheme } from '@noble/post-quantum/ml-dsa.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { digest, type JsonValue } from '../src/verify/canonical.js'

/**
 * What a v2 instance publishes, built from the specification alone: a key manifest signed by the
 * root (REG-1), and one unsigned key file per key that is not revoked (REG-2).
 */

interface Keypair { publicKey: Uint8Array, secretKey: Uint8Array }
interface Scheme { sign: (message: Uint8Array, secretKey: Uint8Array) => Uint8Array }

const MANIFEST_PATH = '.genoacms/keys/public.json'
const MANIFEST_TYPE = 'genoacms.keyRegistry.v2'

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const hex = (bytes: Uint8Array): string => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')

const digestOf = (publicKey: Uint8Array): string => hex(sha256(publicKey))
const keyIdOf = (publicKey: Uint8Array): string => digestOf(publicKey).slice(0, 16)
const keyFilePathOf = (keyId: string): string => `.genoacms/keys/public/${keyId}.json`

const rootKeypair = (fill: number): Keypair => rootScheme.keygen(new Uint8Array(rootScheme.lengths.seed).fill(fill))
const subordinateKeypair = (fill: number): Keypair => subordinateScheme.keygen(new Uint8Array(subordinateScheme.lengths.seed).fill(fill))

/** Signs an envelope exactly as the specification says one is signed. */
const signEnvelope = (alg: string, keyId: string, type: string, payload: JsonValue, secretKey: Uint8Array, scheme: Scheme) => ({
  alg,
  keyId,
  type,
  payload,
  signature: toBase64(scheme.sign(digest({ alg, keyId, type, payload }), secretKey))
})

const signedBySubordinate = (key: Keypair, type: string, payload: JsonValue, keyId = keyIdOf(key.publicKey)) =>
  signEnvelope('ML-DSA-65', keyId, type, payload, key.secretKey, subordinateScheme)

const signedByRoot = (key: Keypair, type: string, payload: JsonValue) =>
  signEnvelope('SLH-DSA-SHA2-128s', keyIdOf(key.publicKey), type, payload, key.secretKey, rootScheme)

const entryOf = (key: Keypair, moments: { createdAt?: number, supersededAt?: number, revokedAt?: number } = {}) => ({
  keyId: keyIdOf(key.publicKey),
  alg: 'ML-DSA-65',
  digest: digestOf(key.publicKey),
  createdAt: moments.createdAt ?? 1_700_000_000_000,
  ...(moments.supersededAt === undefined ? {} : { supersededAt: moments.supersededAt }),
  ...(moments.revokedAt === undefined ? {} : { revokedAt: moments.revokedAt })
})

const keyFileOf = (key: Keypair, keyId = keyIdOf(key.publicKey)) => ({
  keyId,
  alg: 'ML-DSA-65',
  publicKey: toBase64(key.publicKey)
})

const signedManifests = new Map<string, ReturnType<typeof signedByRoot>>()

/** A manifest the root signed, memoized: SLH-DSA signing takes long enough to matter across a file. */
const signedManifest = (root: Keypair, payload: JsonValue, type = MANIFEST_TYPE) => {
  const key = `${toBase64(root.publicKey)} ${type} ${JSON.stringify(payload)}`
  if (!signedManifests.has(key)) signedManifests.set(key, signedByRoot(root, type, payload))
  return structuredClone(signedManifests.get(key)!)
}

/** A `Source` over an in-memory bucket that records every path asked for, in order. */
const recordingSource = (served: Record<string, unknown>) => {
  const reads: string[] = []
  const source = {
    read: async (path: string): Promise<string | undefined> => {
      reads.push(path)
      return path in served ? JSON.stringify(served[path]) : undefined
    }
  }
  return { source, reads }
}

export {
  MANIFEST_PATH,
  MANIFEST_TYPE,
  toBase64,
  digestOf,
  keyIdOf,
  keyFilePathOf,
  rootKeypair,
  subordinateKeypair,
  signEnvelope,
  signedBySubordinate,
  signedByRoot,
  entryOf,
  keyFileOf,
  signedManifest,
  recordingSource
}
export type { Keypair }
