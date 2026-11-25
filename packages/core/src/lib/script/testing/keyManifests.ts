import { createHash } from 'node:crypto'
import { getAlgorithm, ROOT_ALGORITHM, SUBORDINATE_ALGORITHM, type Keypair } from '#lib/script/signing/algorithms.js'
import { deriveKeyId } from '#lib/script/signing/keyId.js'
import { sign, toBase64, type DocumentType, type SignedEnvelope } from '#lib/script/signing/envelope.js'
import { ROOT_SEED_SECRET, REGISTRY_SEQUENCE_SECRET, subordinateSeedSecret } from '#lib/script/signing/secretNames.js'
import type { JsonValue } from '#lib/script/signing/canonical.js'

const MANIFEST_PATH = '.genoacms/keys/public.json'
const KEY_FILE_PATTERN = /^\.genoacms\/keys\/public\/[0-9a-f]{16}\.json$/

const rootAlgorithm = getAlgorithm(ROOT_ALGORITHM)
const subordinateAlgorithm = getAlgorithm(SUBORDINATE_ALGORITHM)

/** The root seed every test of the key manifest starts from, as the secrets service holds it. */
const testRootSeed = new Uint8Array(rootAlgorithm.lengths.seed).fill(4)
const testRoot: Keypair = rootAlgorithm.generateKeypair(testRootSeed)
const testRootKeyId = deriveKeyId(testRoot.publicKey)

const keyFilePathOf = (keyId: string): string => `.genoacms/keys/public/${keyId}.json`

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

const subordinateKeypair = (fill: number): Keypair =>
  subordinateAlgorithm.generateKeypair(new Uint8Array(subordinateAlgorithm.lengths.seed).fill(fill))

/** A REG-1 entry for a public key, its digest computed here rather than by the code under test. */
const registeredKeyOf = (publicKey: Uint8Array, createdAt = 1_000) => ({
  keyId: deriveKeyId(publicKey),
  alg: SUBORDINATE_ALGORITHM,
  digest: sha256Hex(publicKey),
  createdAt
})

/** A REG-2 key file, members in the order core writes them. */
const keyFileOf = (publicKey: Uint8Array) => ({
  keyId: deriveKeyId(publicKey),
  alg: SUBORDINATE_ALGORITHM,
  publicKey: toBase64(publicKey)
})

/** A manifest envelope signed by the test root, under any type name. */
const rootSigned = (type: string, payload: JsonValue): SignedEnvelope =>
  sign(type as DocumentType, payload, { alg: ROOT_ALGORITHM, keyId: testRootKeyId, secretKey: testRoot.secretKey })

export {
  MANIFEST_PATH,
  KEY_FILE_PATTERN,
  ROOT_SEED_SECRET,
  REGISTRY_SEQUENCE_SECRET,
  subordinateSeedSecret,
  testRootSeed,
  testRoot,
  testRootKeyId,
  keyFilePathOf,
  sha256Hex,
  subordinateKeypair,
  registeredKeyOf,
  keyFileOf,
  rootSigned
}
