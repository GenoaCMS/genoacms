import { randomBytes } from 'node:crypto'
import { getOrClaimSecret } from '$lib/script/secrets/providers.server'
import { getAlgorithm, ROOT_ALGORITHM, type Keypair } from './algorithms'
import { deriveKeyId } from './keyId'
import { fromBase64, toBase64, type SigningKey } from './envelope'
import { ROOT_SEED_SECRET } from './secretNames'

/**
 * The root trust anchor.
 *
 * The root signs one thing: the registry of subordinate public keys. Everything else is signed by a
 * subordinate, which is why the root can afford a slow, conservative, hash-based algorithm and why
 * rotating it is the only rotation that requires redeploying consumers — its public key is what a
 * client SDK embeds.
 *
 * Only the **seed** is stored. Key generation is deterministic from it, so a 48-byte value in the
 * secret manager stands in for a keypair; holding the seed is equivalent to holding the key, so
 * nothing is given away by storing the smaller thing.
 */

const algorithm = getAlgorithm(ROOT_ALGORITHM)

function generateSeed (): string {
  return toBase64(new Uint8Array(randomBytes(algorithm.lengths.seed)))
}

function keypairFromSeed (encodedSeed: string): Keypair {
  const seed = fromBase64(encodedSeed)
  if (seed === undefined) {
    throw new Error(`root-key/seed-not-base64: ${ROOT_SEED_SECRET} is not valid base64`)
  }
  if (seed.length !== algorithm.lengths.seed) {
    // A wrong-sized seed is a corrupted or hand-edited secret. Deriving from it anyway would
    // produce a valid-looking key that is not the one this instance was set up with, and every
    // artifact signed under it would be rejected by consumers holding the real anchor.
    throw new Error(
      `root-key/seed-wrong-size: ${ROOT_SEED_SECRET} is ${seed.length} bytes, ` +
      `expected ${algorithm.lengths.seed}`
    )
  }
  return algorithm.generateKeypair(seed)
}

interface RootKey {
  alg: typeof ROOT_ALGORITHM
  keyId: string
  publicKey: Uint8Array
  secretKey: Uint8Array
  /** True when this process created the anchor, which happens once in an instance's lifetime. */
  bootstrapped: boolean
}

let cached: RootKey | undefined

/**
 * Loads the root key, generating it on first boot.
 *
 * Generation is guarded by an atomic claim rather than by a check: two instances starting together
 * would otherwise each mint an anchor, the last write would win, and the other would sign with a
 * key no consumer trusts — undetectable until a legitimate artifact is rejected in the field. The
 * seed is generated only after the claim is won.
 */
async function loadRootKey (): Promise<RootKey> {
  if (cached !== undefined) return cached

  const { value, claimed } = await getOrClaimSecret(ROOT_SEED_SECRET, generateSeed)
  const keypair = keypairFromSeed(value)

  cached = {
    alg: ROOT_ALGORITHM,
    keyId: deriveKeyId(keypair.publicKey),
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
    bootstrapped: claimed
  }

  if (claimed) {
    console.warn(
      `[genoacms:signing] generated a new root trust anchor, keyId ${cached.keyId}. ` +
      'Consumer SDKs must embed this public key.'
    )
  }
  return cached
}

/** The signing identity handed to `sign()` for the key registry. */
async function getRootSigningKey (): Promise<SigningKey> {
  const root = await loadRootKey()
  return { alg: root.alg, keyId: root.keyId, secretKey: root.secretKey }
}

/** The trust anchor a consumer embeds — 32 bytes, base64. */
async function getRootPublicKey (): Promise<{ keyId: string, alg: string, publicKey: string }> {
  const root = await loadRootKey()
  return { keyId: root.keyId, alg: root.alg, publicKey: toBase64(root.publicKey) }
}

export {
  keypairFromSeed,
  loadRootKey,
  getRootSigningKey,
  getRootPublicKey
}

export type {
  RootKey
}
