import { KeyResolver } from './keyResolver'
import { loadOrBootstrapRegistry, rotateSubordinateKey as rotateAndPublish } from './registry.server'
import { loadSubordinateKey, toSigningKey } from './subordinateKey.server'
import { currentKey, type KeyRegistry } from './registry'
import type { SigningKey } from './envelope'

/**
 * The chain of trust as the rest of GenoaCMS uses it: a `keyId` in, a verification key out, and a
 * signing key for whatever is current.
 *
 * Everything below this is wired here once — the registry loader, its cache, and the seeds. Callers
 * name a key; they do not fetch, verify or parse anything.
 */

const resolver = new KeyResolver(async () => (await loadOrBootstrapRegistry()).registry)

/**
 * The public key that verifies signatures made under `keyId`, or `undefined` when the registry does
 * not list it.
 *
 * `undefined` means the signature cannot be verified — it must never be read as "verified". A caller
 * that treated an unresolvable key as acceptable would accept every forgery.
 */
async function resolveVerificationKey (keyId: string): Promise<Uint8Array | undefined> {
  return await resolver.resolve(keyId)
}

/**
 * The key to sign new artifacts with.
 *
 * The registry names which key is current; the secret store holds its seed. A current key whose seed
 * has gone missing is a broken instance rather than a reason to quietly pick another — signing with
 * a key the registry does not present as current would produce artifacts a conforming consumer is
 * right to distrust.
 */
async function getCurrentSigningKey (): Promise<SigningKey> {
  const registry = await resolver.getRegistry()
  const entry = currentKey(registry)
  const key = await loadSubordinateKey(entry.keyId)
  if (key === undefined) {
    throw new Error(
      `signing/current-key-unavailable: the registry names ${entry.keyId} as current but its seed ` +
      'is not in the secret store'
    )
  }
  return toSigningKey(key)
}

async function getRegistry (): Promise<KeyRegistry> {
  return await resolver.getRegistry()
}

/** Rotates, then drops the cache so this instance sees its own new key without waiting. */
async function rotateSubordinateKey (): Promise<KeyRegistry> {
  const rotated = await rotateAndPublish()
  resolver.invalidate()
  return rotated
}

export {
  resolveVerificationKey,
  getCurrentSigningKey,
  getRegistry,
  rotateSubordinateKey
}
