import { inject } from 'vitest'
import runtime from '@genoacms/adapter-gcp/storage/runtime'
import secretsRuntime from '@genoacms/adapter-secrets-env/runtime'
import { getAlgorithm } from '../src/lib/script/signing/algorithms'
import { sign, fromBase64, type SignedEnvelope } from '../src/lib/script/signing/envelope'
import { parseKeyRegistry, currentKey } from '../src/lib/script/signing/registry'
import { subordinateSeedSecret } from '../src/lib/script/signing/secretNames'
import type { JsonValue } from '../src/lib/script/signing/canonical'

const projectId = process.env.GENOACMS_TEST_GCP_PROJECT ?? 'genoacms'
const bucket = process.env.GENOACMS_TEST_GCP_BUCKET ?? 'genoacms-tests'

async function readRegistryPayload (): Promise<unknown> {
  const storage = await runtime.create({ projectId }, { name: 'e2e', resources: [bucket] })
  const object = await storage.getObject({ bucket, name: '.genoacms/keys/public.json' })
  const chunks: Buffer[] = []
  for await (const chunk of object.data as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
  return (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { payload: unknown }).payload
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
  const parsed = parseKeyRegistry(await readRegistryPayload())
  if (!parsed.ok) throw new Error(`e2e/registry: ${parsed.reason}`)
  const entry = currentKey(parsed.registry)
  const keypair = getAlgorithm(entry.alg).generateKeypair(await readSeed(entry.keyId))
  return sign('genoacms.collectionDefinition.v1', { database, definition } as unknown as JsonValue, { alg: entry.alg, keyId: entry.keyId, secretKey: keypair.secretKey })
}
