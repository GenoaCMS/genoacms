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
  setSecretIfAbsent: Adapter.setSecretIfAbsent
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

const CLAIM_POLL_ATTEMPTS = 25
const CLAIM_POLL_INTERVAL_MS = 200

/**
 * Ensures a key holds a value, generating one only if this instance wins the right to.
 *
 * The generator runs **after** the claim is won, never before, so a losing instance never even
 * produces a value it might be tempted to use.
 *
 * The polling matters as much as the claim. A provider that creates a key and writes its value in
 * two calls can be interrupted between them, leaving a key that exists and holds nothing. An
 * instance reading that as "not configured" would generate its own — which is the exact failure the
 * claim exists to prevent — so the loser waits, and then fails loudly rather than assuming.
 *
 * @returns the stored value and whether this instance is the one that created it
 */
async function getOrClaimSecret (
  key: string,
  generate: () => string
): Promise<{ value: string, claimed: boolean }> {
  assertValidSecretKey(key)

  const existing = await adapter.getSecret(key)
  if (existing !== undefined) return { value: existing, claimed: false }

  if (await adapter.setSecretIfAbsent(key, generate())) {
    const stored = await adapter.getSecret(key)
    if (stored === undefined) {
      throw new Error(`secrets/claim-not-readable: wrote '${key}' but it reads back empty`)
    }
    return { value: stored, claimed: true }
  }

  for (let attempt = 0; attempt < CLAIM_POLL_ATTEMPTS; attempt++) {
    const value = await adapter.getSecret(key)
    if (value !== undefined) return { value, claimed: false }
    await new Promise(resolve => setTimeout(resolve, CLAIM_POLL_INTERVAL_MS))
  }

  throw new Error(
    `secrets/claim-abandoned: '${key}' was claimed by another instance but never given a value. ` +
    'Another instance most likely failed part-way through first-time setup. ' +
    'Delete the key from the secret store so it can be created again.'
  )
}

export {
  getSecret,
  setSecret,
  deleteSecret,
  getOrClaimSecret
}
