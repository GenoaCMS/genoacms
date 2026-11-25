import { inject } from 'vitest'
import runtime from '@genoacms/adapter-gcp/storage/runtime'
import { isNotFound } from '@genoacms/contracts/storage'
import secretsRuntime from '@genoacms/adapter-secrets-env/runtime'
import { getAlgorithm } from '../src/lib/script/signing/algorithms'
import { sign, fromBase64, type SignedEnvelope } from '../src/lib/script/signing/envelope'
import { parseKeyManifest, currentKey } from '../src/lib/script/signing/registry'
import { subordinateSeedSecret } from '../src/lib/script/signing/secretNames'
import type { JsonValue } from '../src/lib/script/signing/canonical'

const projectId = process.env.GENOACMS_TEST_GCP_PROJECT ?? 'genoacms'
const bucket = process.env.GENOACMS_TEST_GCP_BUCKET ?? 'genoacms-tests'

async function readRegistryPayload (): Promise<unknown> {
  return (await readStoredJSON('.genoacms/keys/public.json') as { payload: unknown }).payload
}

/** An object of the test bucket, parsed, or `undefined` when nothing is stored there. */
export async function readStoredJSON (name: string): Promise<unknown> {
  const storage = await runtime.create({ projectId }, { name: 'e2e', resources: [bucket] })
  let object
  try {
    object = await storage.getObject({ bucket, name })
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
  const chunks: Buffer[] = []
  for await (const chunk of object.data as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** The payload of the key manifest the running instance published (REG-1). */
export async function readManifestPayload (): Promise<{ sequence: number, current: string, keys: Array<Record<string, unknown>> }> {
  return await readRegistryPayload() as { sequence: number, current: string, keys: Array<Record<string, unknown>> }
}

/** The key file of a key (REG-2), or `undefined` when it is not stored. */
export async function readKeyFile (keyId: string): Promise<{ keyId: string, alg: string, publicKey: string } | undefined> {
  return await readStoredJSON(`.genoacms/keys/public/${keyId}.json`) as { keyId: string, alg: string, publicKey: string } | undefined
}

async function readSeed (keyId: string): Promise<Uint8Array> {
  const secrets = secretsRuntime.create({ path: inject('secretsFile') }, { name: 'e2e', resources: [], projectRoot: '/' })
  const seed = await secrets.getSecret(subordinateSeedSecret(keyId))
  const bytes = seed === undefined ? undefined : fromBase64(seed)
  if (bytes === undefined) throw new Error(`e2e/no-seed: the secrets file holds no seed for ${keyId}`)
  return bytes
}

/** Signs a definition with the running instance's current subordinate key, as core would (COL-7). */
export async function signCollectionDefinition (database: string, definition: { name: string }): Promise<SignedEnvelope> {
  const parsed = parseKeyManifest(await readRegistryPayload())
  if (!parsed.ok) throw new Error(`e2e/registry: ${parsed.reason}`)
  const entry = currentKey(parsed.manifest)
  const keypair = getAlgorithm(entry.alg).generateKeypair(await readSeed(entry.keyId))
  return sign('genoacms.collectionDefinition.v1', { database, definition } as unknown as JsonValue, { alg: entry.alg, keyId: entry.keyId, secretKey: keypair.secretKey })
}
