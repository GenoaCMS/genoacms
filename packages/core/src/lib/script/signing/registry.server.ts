import { join } from 'path'
import {
  getInternalObjectStringVersioned,
  uploadInternalObjectJSON
} from '$lib/script/storage/storage.server'
import { isPreconditionFailed } from '@genoacms/cloudabstraction/storage'
import { loadRootKey, getRootSigningKey } from './rootKey.server'
import { createSubordinateKey } from './subordinateKey.server'
import { sign, verify } from './envelope'
import { parseKeyRegistry, toPayload, withRotatedKey, type KeyRegistry } from './registry'

/**
 * Reading and writing `.genoacms/keys/public.json`.
 *
 * The registry is the hinge of the chain of trust: the root signs it, and it names every subordinate
 * key a consumer will accept. Everything a consumer trusts follows from the root public key it
 * embeds plus this document, which is why the root signs nothing else — one document to fetch, one
 * signature to check, and rotation of everything beneath it costs no consumer redeployment.
 */

const registryPath = join('.genoacms', 'keys', 'public.json')

interface LoadedRegistry {
  registry: KeyRegistry
  /** For a conditional write, so a rotation cannot overwrite one it did not see. */
  version?: string
}

type RegistryLoadResult =
  | { ok: true, value: LoadedRegistry }
  | { ok: false, reason: string, absent: boolean }

/**
 * Reads and verifies the registry.
 *
 * The root signature is checked before the payload is parsed, and the payload is validated after —
 * two independent gates. The signature establishes that this instance wrote the document; the
 * validation establishes that the document is internally consistent, which catches a registry
 * signed by a compromised root that names a key its own entry does not derive.
 */
async function loadRegistry (): Promise<RegistryLoadResult> {
  let raw: string
  let version: string | undefined
  try {
    const object = await getInternalObjectStringVersioned(registryPath)
    version = object.version
    raw = object.text
  } catch (error) {
    return { ok: false, reason: `registry-unreadable: ${(error as Error).message}`, absent: true }
  }

  let candidate: unknown
  try {
    candidate = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'registry-not-json', absent: false }
  }

  const root = await loadRootKey()
  const verified = verify(candidate, 'genoacms.keyRegistry.v1', root.publicKey)
  if (!verified.valid) {
    return { ok: false, reason: `registry-signature: ${verified.reason}`, absent: false }
  }

  const parsed = parseKeyRegistry(verified.payload)
  if (!parsed.ok) return { ok: false, reason: `registry-invalid: ${parsed.reason}`, absent: false }

  return { ok: true, value: { registry: parsed.registry, version } }
}

/**
 * Writes the registry, signed by the root.
 *
 * `expected` carries the version the caller read. Omitting it means the caller believes no registry
 * exists, and the write is conditional on that — so two instances bootstrapping together cannot
 * both create one, and a rotation cannot silently overwrite a rotation it never saw.
 */
async function writeRegistry (registry: KeyRegistry, expected?: string): Promise<void> {
  const envelope = sign('genoacms.keyRegistry.v1', toPayload(registry), await getRootSigningKey())
  await uploadInternalObjectJSON(
    registryPath,
    envelope,
    expected === undefined ? { ifAbsent: true } : { ifVersion: expected }
  )
}

/**
 * Returns the registry, creating it with a first subordinate key when none exists.
 *
 * Losing the race to create is not a failure — the winner's registry is as good as ours would have
 * been, so the loser re-reads and adopts it. The subordinate key it generated on the way is simply
 * abandoned: an unreferenced seed costs a secret, where forcing the loser to fail would cost a
 * start-up.
 */
async function loadOrBootstrapRegistry (): Promise<LoadedRegistry> {
  const existing = await loadRegistry()
  if (existing.ok) return existing.value
  if (!existing.absent) {
    // A registry that exists but does not verify is not something to replace — overwriting it would
    // destroy the evidence and could be exactly what an attacker wants.
    throw new Error(`registry/unusable: ${existing.reason}`)
  }

  const key = await createSubordinateKey()
  const registry: KeyRegistry = {
    current: key.keyId,
    keys: [{
      keyId: key.keyId,
      alg: key.alg,
      publicKey: Buffer.from(key.publicKey).toString('base64'),
      createdAt: Date.now()
    }]
  }

  try {
    await writeRegistry(registry)
  } catch (error) {
    if (!isPreconditionFailed(error)) throw error
    const winner = await loadRegistry()
    if (!winner.ok) throw new Error(`registry/unusable-after-race: ${winner.reason}`)
    return winner.value
  }

  const written = await loadRegistry()
  if (!written.ok) throw new Error(`registry/unreadable-after-write: ${written.reason}`)
  return written.value
}

/** Appends a freshly generated key, marks the outgoing one superseded, and publishes the result. */
async function rotateSubordinateKey (): Promise<KeyRegistry> {
  const { registry, version } = await loadOrBootstrapRegistry()
  const key = await createSubordinateKey()
  const rotated = withRotatedKey(registry, {
    keyId: key.keyId,
    alg: key.alg,
    publicKey: Buffer.from(key.publicKey).toString('base64'),
    createdAt: Date.now()
  }, Date.now())

  await writeRegistry(rotated, version)
  return rotated
}

export {
  registryPath,
  loadRegistry,
  writeRegistry,
  loadOrBootstrapRegistry,
  rotateSubordinateKey
}

export type {
  LoadedRegistry
}
