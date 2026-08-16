import { config } from '@genoacms/cloudabstraction'
import type { Adapter } from '@genoacms/cloudabstraction/secrets'
import { assertValidSecretKey } from '@genoacms/cloudabstraction/secrets'

/**
 * The secrets service as the rest of GenoaCMS sees it.
 *
 * Unlike storage and database, this resolves to **exactly one** adapter. A secret store is a single
 * authority: with two configured, a write has no defensible target, and a key present in one but
 * not the other would make behaviour depend on lookup order — which is a difference that would show
 * up as an intermittent authentication failure rather than as a configuration error.
 */

function getSoleProvider () {
  const providers = config.secrets?.providers ?? []
  if (providers.length === 0) {
    throw new Error('secrets/no-provider: configure exactly one provider under `secrets` in genoa.config')
  }
  if (providers.length > 1) {
    const names = providers.map(provider => provider.name).join(', ')
    throw new Error(`secrets/multiple-providers: exactly one is allowed, found ${providers.length} (${names})`)
  }
  return providers[0]
}

const provider = getSoleProvider()
const adapter = await provider.adapter as unknown as {
  getSecret: Adapter.getSecret
  setSecret: Adapter.setSecret
  deleteSecret: Adapter.deleteSecret
}

/** Resolves to `undefined` when the key does not exist. */
async function getSecret (key: string): Promise<string | undefined> {
  assertValidSecretKey(key)
  return await adapter.getSecret(key)
}

async function setSecret (key: string, value: string): Promise<boolean> {
  assertValidSecretKey(key)
  return await adapter.setSecret(key, value)
}

/** Resolves `false` when the key was already absent, so deletion is idempotent. */
async function deleteSecret (key: string): Promise<boolean> {
  assertValidSecretKey(key)
  return await adapter.deleteSecret(key)
}

export {
  getSecret,
  setSecret,
  deleteSecret
}
