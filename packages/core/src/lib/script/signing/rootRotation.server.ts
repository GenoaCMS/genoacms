import { randomBytes } from 'node:crypto'
import { setSecret } from '$lib/script/secrets/providers.server'
import { uploadInternalObjectJSON } from '$lib/script/storage/storage.server'
import { getAlgorithm, ROOT_ALGORITHM } from './algorithms'
import { deriveKeyId } from './keyId'
import { sign, toBase64, type SigningKey } from './envelope'
import { ROOT_SEED_SECRET } from './secretNames'
import { createSubordinateKey } from './subordinateKey.server'
import { registryPath } from './registry.server'
import { toPayload, type KeyRegistry } from './registry'
import { readHighWaterMark, recordPublished } from './registrySequence.server'
import { policyPath, POLICY_DOCUMENT, defaultPolicy } from '$lib/script/securityPolicy/policy.server'
import type { JsonValue } from './canonical'

/**
 * Replacing the root trust anchor.
 *
 * This strands **every deployed consumer** until it is rebuilt with the new public key, so it is a
 * command an operator runs — not something reachable from the CMS. The operation that can break
 * every consumer belongs with whoever can also redeploy them.
 */

const algorithm = getAlgorithm(ROOT_ALGORITHM)

interface RootRotationResult {
  keyId: string
  /** base64, 32 bytes — what every consumer SDK must embed. */
  publicKey: string
  /** The single key the new registry contains. */
  subordinateKeyId: string
  sequence: number
}

/**
 * Rotates the root, rebuilding the registry around one fresh subordinate key.
 *
 * **Existing subordinate keys are discarded.** A compromised root could have signed a registry
 * naming keys the adversary controls, and once the anchor that vouched for them is untrusted
 * nothing distinguishes those from the legitimate ones. Manifests signed by them consequently stop
 * verifying and are quarantined and replaced — the cost of a root compromise, not a side effect to
 * be smoothed over.
 */
async function rotateRootKey (): Promise<RootRotationResult> {
  const seed = new Uint8Array(randomBytes(algorithm.lengths.seed))
  const keypair = algorithm.generateKeypair(seed)
  const keyId = deriveKeyId(keypair.publicKey)

  // Overwrites rather than claims: the point is to replace an anchor that already exists.
  await setSecret(ROOT_SEED_SECRET, toBase64(seed))

  const signingKey: SigningKey = { alg: ROOT_ALGORITHM, keyId, secretKey: keypair.secretKey }
  const subordinate = await createSubordinateKey()

  // The old registry can no longer be verified, so nothing in it may be believed — including its
  // sequence. The high-water mark is the only trustworthy record of how far it had advanced, and
  // continuing from it preserves rollback detection across the rotation.
  const sequence = await readHighWaterMark() + 1

  const registry: KeyRegistry = {
    sequence,
    current: subordinate.keyId,
    keys: [{
      keyId: subordinate.keyId,
      alg: subordinate.alg,
      publicKey: toBase64(subordinate.publicKey),
      createdAt: Date.now()
    }]
  }

  // Unconditional: this replaces a document that exists and can no longer be verified, and the
  // procedure is a single operator running a single command.
  await uploadInternalObjectJSON(registryPath, sign('genoacms.keyRegistry.v1', toPayload(registry), signingKey), {})
  await recordPublished(sequence)

  // The policy is root-signed too, so it must be reissued under the new anchor or it stops
  // verifying and the instance silently falls back to configured defaults.
  await uploadInternalObjectJSON(
    policyPath,
    sign(POLICY_DOCUMENT, defaultPolicy() as unknown as JsonValue, signingKey),
    {}
  )

  return {
    keyId,
    publicKey: toBase64(keypair.publicKey),
    subordinateKeyId: subordinate.keyId,
    sequence
  }
}

export {
  rotateRootKey
}

export type {
  RootRotationResult
}
