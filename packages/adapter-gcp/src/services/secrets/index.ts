import type { Adapter } from '@genoacms/cloudabstraction/secrets'
import type { SecretProvider } from '../../genoa.config.js'
import { getProvider } from '@genoacms/cloudabstraction'
import { assertValidSecretKey } from '@genoacms/cloudabstraction/secrets'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

/**
 * The GenoaCMS `secrets` service backed by GCP Secret Manager.
 *
 * Secret Manager is versioned; this contract is not. Writes add a version and reads always take
 * `latest`, so version history exists but is never consulted. That is deliberate — building the
 * contract on a provider-specific behaviour would leave the abstraction unimplementable elsewhere.
 * The practical consequence is that **superseded versions accumulate**: they are invisible to
 * GenoaCMS but still billed and still readable by anyone with project access, so a rotation policy
 * at the project level is worth having.
 */

const ADAPTER_PATH = '@genoacms/adapter-gcp/secrets'
const provider = getProvider('secrets', ADAPTER_PATH) as SecretProvider
const projectId = provider.projectId
const client = new SecretManagerServiceClient({
  projectId,
  credentials: provider.credentials
})

/** gRPC status codes. */
const NOT_FOUND = 5
const ALREADY_EXISTS = 6

const parent = `projects/${projectId}`
const secretName = (key: string): string => `${parent}/secrets/${key}`
const latestVersionName = (key: string): string => `${secretName(key)}/versions/latest`

function hasStatusCode (error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === code
}

/**
 * Creating on demand keeps `setSecret` a single call for the caller. A concurrent create losing the
 * race is not a failure — the secret it wanted now exists.
 */
async function ensureSecretExists (key: string): Promise<void> {
  try {
    await client.getSecret({ name: secretName(key) })
  } catch (error) {
    if (!hasStatusCode(error, NOT_FOUND)) throw error
    try {
      await client.createSecret({
        parent,
        secretId: key,
        secret: { replication: { automatic: {} } }
      })
    } catch (createError) {
      if (!hasStatusCode(createError, ALREADY_EXISTS)) throw createError
    }
  }
}

/**
 * Resolves to `undefined` only when the secret does not exist.
 *
 * Every other failure propagates, including a `latest` version that has been disabled or destroyed.
 * Reporting that as absence would be worse than failing: a caller reads absence as "not configured
 * yet" and generates a replacement, so a disabled key would quietly become a *new* key rather than
 * an error.
 */
const getSecret: Adapter.getSecret = async (key: string) => {
  assertValidSecretKey(key)
  try {
    const [version] = await client.accessSecretVersion({ name: latestVersionName(key) })
    const data = version.payload?.data
    if (data === null || data === undefined) return undefined
    return typeof data === 'string' ? data : Buffer.from(data).toString('utf-8')
  } catch (error) {
    if (hasStatusCode(error, NOT_FOUND)) return undefined
    throw error
  }
}

const setSecret: Adapter.setSecret = async (key: string, value: string) => {
  assertValidSecretKey(key)
  await ensureSecretExists(key)
  await client.addSecretVersion({
    parent: secretName(key),
    payload: { data: Buffer.from(value, 'utf-8') }
  })
  return true
}

/** Removes the secret and every version of it. Resolves `false` when it was already absent. */
const deleteSecret: Adapter.deleteSecret = async (key: string) => {
  assertValidSecretKey(key)
  try {
    await client.deleteSecret({ name: secretName(key) })
    return true
  } catch (error) {
    if (hasStatusCode(error, NOT_FOUND)) return false
    throw error
  }
}

export {
  getSecret,
  setSecret,
  deleteSecret
}
