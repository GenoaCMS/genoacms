import { getAlgorithm, SUBORDINATE_ALGORITHM } from '$lib/script/signing/algorithms'
import { deriveKeyId } from '$lib/script/signing/keyId'
import type { SigningKey } from '$lib/script/signing/envelope'

const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)
const keypair = algorithm.generateKeypair(new Uint8Array(algorithm.lengths.seed).fill(7))
const keyId = deriveKeyId(keypair.publicKey)

const signingKey: SigningKey = { alg: SUBORDINATE_ALGORITHM, keyId, secretKey: keypair.secretKey }

/** The key resolution module with one real ML-DSA-65 subordinate key and no registry in storage. */
const testKeyResolution = {
  getCurrentSigningKey: async (): Promise<SigningKey> => signingKey,
  resolveVerificationKey: async (candidate: string): Promise<Uint8Array | undefined> =>
    candidate === keyId ? keypair.publicKey : undefined,
  getRegistry: async () => { throw new Error('the test key resolution has no registry') },
  rotateSubordinateKey: async () => { throw new Error('the test key resolution does not rotate') },
  revokeSubordinateKey: async () => { throw new Error('the test key resolution does not revoke') }
}

/** The security policy every unit test of this directory reads. */
const testSecurityPolicy = {
  subordinateKeyRotationDays: 90,
  accessTokenMinutes: 15,
  grantCacheSeconds: 0,
  refreshTokenDays: 14,
  maxFuel: 1_000_000,
  maxDepth: 100,
  maxAllocation: 10_000_000,
  fetchOrigins: []
}

export { testKeyResolution, testSecurityPolicy, signingKey }
