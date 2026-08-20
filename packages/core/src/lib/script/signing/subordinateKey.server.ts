import { randomBytes } from 'node:crypto'
import { deleteSecret, getSecret, setSecretIfAbsent } from '$lib/script/secrets/providers.server'
import { getAlgorithm, SUBORDINATE_ALGORITHM, type AlgorithmName } from './algorithms'
import { deriveKeyId } from './keyId'
import { fromBase64, toBase64, type SigningKey } from './envelope'
import { subordinateSeedSecret } from './secretNames'

/**
 * Subordinate operational keys — the keys that sign everything except the key registry.
 *
 * One secret per key, named by `keyId`, so rotation is **additive**: creating a key writes a name
 * nothing else uses, rather than replacing a value another request may be part-way through reading.
 * A signature already in flight against the outgoing key therefore keeps resolving, and no rotation
 * is ever a read-modify-write.
 *
 * Which key is *current* is not recorded here. The registry states it, so there is exactly one
 * place that answers the question — a second answer in the secret store could disagree with it.
 */

const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)

interface SubordinateKey {
  alg: AlgorithmName
  keyId: string
  publicKey: Uint8Array
  secretKey: Uint8Array
}

function fromSeed (seed: Uint8Array): SubordinateKey {
  const keypair = algorithm.generateKeypair(seed)
  return {
    alg: SUBORDINATE_ALGORITHM,
    keyId: deriveKeyId(keypair.publicKey),
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey
  }
}

/**
 * Generates a new subordinate key and stores its seed.
 *
 * The keypair is derived **before** the secret is named, because the name is a function of the
 * public key. A name that is already taken therefore means two distinct seeds produced the same
 * key — which does not happen by chance — so it is an error rather than a rotation, and overwriting
 * would destroy the seed of a key the registry may still be publishing.
 */
async function createSubordinateKey (): Promise<SubordinateKey> {
  const seed = new Uint8Array(randomBytes(algorithm.lengths.seed))
  const key = fromSeed(seed)
  const name = subordinateSeedSecret(key.keyId)

  // The atomic form rather than check-then-write: a gap between the two would let a concurrent
  // generation overwrite a seed the registry may already be publishing.
  if (!await setSecretIfAbsent(name, toBase64(seed))) {
    throw new Error(`subordinate-key/id-collision: ${name} already exists`)
  }
  return key
}

/**
 * Re-derives a subordinate key from its stored seed.
 *
 * Resolves `undefined` when the seed is absent, which is an ordinary state: a key the registry
 * still lists for *verification* may have had its seed deleted once nothing needed to sign with it.
 * A malformed seed is not ordinary and raises.
 */
async function loadSubordinateKey (keyId: string): Promise<SubordinateKey | undefined> {
  const name = subordinateSeedSecret(keyId)
  const stored = await getSecret(name)
  if (stored === undefined) return undefined

  const seed = fromBase64(stored)
  if (seed === undefined) throw new Error(`subordinate-key/seed-not-base64: ${name}`)
  if (seed.length !== algorithm.lengths.seed) {
    throw new Error(`subordinate-key/seed-wrong-size: ${name} is ${seed.length} bytes, expected ${algorithm.lengths.seed}`)
  }

  const key = fromSeed(seed)
  if (key.keyId !== keyId) {
    // The name says one key and the seed derives another. Signing with it would produce artifacts
    // attributed to a key the registry publishes but that cannot verify them.
    throw new Error(`subordinate-key/seed-mismatch: ${name} derives keyId ${key.keyId}`)
  }
  return key
}

/** Discards a superseded key's seed. Its public key stays in the registry so old signatures verify. */
async function forgetSubordinateKey (keyId: string): Promise<void> {
  await deleteSecret(subordinateSeedSecret(keyId))
}

function toSigningKey (key: SubordinateKey): SigningKey {
  return { alg: key.alg, keyId: key.keyId, secretKey: key.secretKey }
}

export {
  createSubordinateKey,
  loadSubordinateKey,
  forgetSubordinateKey,
  toSigningKey
}

export type {
  SubordinateKey
}
