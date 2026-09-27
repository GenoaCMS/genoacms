import { host } from '$lib/script/host.server'
import { assertValidSecretKey } from '@genoacms/contracts/secrets'

/**
 * The secrets service as the rest of GenoaCMS sees it.
 *
 * Unlike storage and database, this resolves to **exactly one** adapter. A secret store is a single
 * authority: with two configured, a write has no defensible target, and a key present in one but
 * not the other would make behavior depend on lookup order — which is a difference that would show
 * up as an intermittent authentication failure rather than as a configuration error. The loader
 * refuses any other number of providers (`config/secrets-provider-count`).
 */

/** Resolves to `undefined` when the key does not exist. */
async function getSecret (key: string): Promise<string | undefined> {
  assertValidSecretKey(key)
  const adapter = await host.secrets()
  return await adapter.getSecret(key)
}

async function setSecret (key: string, value: string): Promise<boolean> {
  assertValidSecretKey(key)
  const adapter = await host.secrets()
  return await adapter.setSecret(key, value)
}

/** Resolves `false` when the key was already absent, so deletion is idempotent. */
async function deleteSecret (key: string): Promise<boolean> {
  assertValidSecretKey(key)
  const adapter = await host.secrets()
  return await adapter.deleteSecret(key)
}

/**
 * Writes only if the key does not exist. Resolves `true` for the one caller that created it.
 *
 * Prefer `getOrClaimSecret` when the point is to end up with a value; this is for callers that need
 * to know whether the name was free, and for whom a taken name is an error rather than a race lost.
 */
async function setSecretIfAbsent (key: string, value: string): Promise<boolean> {
  assertValidSecretKey(key)
  const adapter = await host.secrets()
  return await adapter.setSecretIfAbsent(key, value)
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
  const adapter = await host.secrets()

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
  setSecretIfAbsent,
  getOrClaimSecret
}
