import { join } from 'path'
import {
  getInternalObjectStringVersioned,
  uploadInternalObjectJSON
} from '#lib/script/storage/storage.server.js'
import { isPreconditionFailed } from '@genoacms/contracts/storage'
import { loadRootKey, getRootSigningKey } from './rootKey.server'
import { createSubordinateKey, forgetSubordinateKey } from './subordinateKey.server'
import { sign, verify } from './envelope'
import { ROOT_ALGORITHM } from './algorithms'
import {
  digestOf, parseKeyManifest, toPayload, withRotatedKey, withRevokedKey,
  type KeyManifest, type RegisteredKey
} from './registry'
import { toKeyFile } from './keyFile'
import { writeKeyFile, deleteKeyFile } from './keyFile.server'
import { checkAndAdvance, recordPublished } from './registrySequence.server'
import type { SubordinateKey } from './subordinateKey.server'

/**
 * Reading and writing `.genoacms/keys/public.json`.
 *
 * The registry is the hinge of the chain of trust: the root signs it, and it names every subordinate
 * key a consumer will accept. Everything a consumer trusts follows from the root public key it
 * embeds plus this document, which is why the root signs nothing else — one document to fetch, one
 * signature to check, and rotation of everything beneath it costs no consumer redeployment.
 */

const registryPath = join('.genoacms', 'keys', 'public.json')
const MANIFEST_DOCUMENT = 'genoacms.keyRegistry.v2'
const EARLIER_DOCUMENT = 'genoacms.keyRegistry.v1'
const NEEDS_MIGRATION = `registry/needs-migration: ${registryPath} is ${EARLIER_DOCUMENT}, which this version of core does not read`

function isEarlierManifest (candidate: unknown): boolean {
  return typeof candidate === 'object' && candidate !== null && (candidate as Record<string, unknown>).type === EARLIER_DOCUMENT
}

function registeredKeyOf (key: SubordinateKey, at: number): RegisteredKey {
  return { keyId: key.keyId, alg: 'ML-DSA-65', digest: digestOf(key.publicKey), createdAt: at }
}

/** REG-2, REG-3: the key file of a freshly minted key. */
async function publishKeyFile (key: SubordinateKey): Promise<void> {
  await writeKeyFile(toKeyFile(key.keyId, 'ML-DSA-65', key.publicKey))
}

interface LoadedRegistry {
  registry: KeyManifest
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

  // REG-6
  if (isEarlierManifest(candidate)) return { ok: false, reason: NEEDS_MIGRATION, absent: false }

  const root = await loadRootKey()
  const verified = verify(candidate, MANIFEST_DOCUMENT, { alg: ROOT_ALGORITHM, publicKey: root.publicKey })
  if (!verified.valid) {
    return { ok: false, reason: `registry-signature: ${verified.reason}`, absent: false }
  }

  const parsed = parseKeyManifest(verified.payload)
  if (!parsed.ok) return { ok: false, reason: `registry-invalid: ${parsed.reason}`, absent: false }

  // A valid signature does not date a document. Without this an adversary who kept an older
  // registry could restore it and undo a revocation, replaying a signature that still verifies.
  const sequence = await checkAndAdvance(parsed.manifest.sequence)
  if (!sequence.ok) {
    return {
      ok: false,
      reason: `registry-rollback: sequence ${sequence.seen} is below the highest seen (${sequence.mark})`,
      absent: false
    }
  }

  return { ok: true, value: { registry: parsed.manifest, version } }
}

/**
 * Writes the registry, signed by the root.
 *
 * `expected` carries the version the caller read. Omitting it means the caller believes no registry
 * exists, and the write is conditional on that — so two instances bootstrapping together cannot
 * both create one, and a rotation cannot silently overwrite a rotation it never saw.
 */
async function writeRegistry (registry: KeyManifest, expected?: string): Promise<void> {
  const envelope = sign(MANIFEST_DOCUMENT, toPayload(registry), await getRootSigningKey())
  await uploadInternalObjectJSON(
    registryPath,
    envelope,
    expected === undefined ? { ifAbsent: true } : { ifVersion: expected }
  )
  // Deliberately after the write. A crash here leaves the mark behind the registry, which the next
  // load repairs; recording first would leave it ahead, and the instance would reject its own
  // current registry and be unable to verify anything.
  await recordPublished(registry.sequence)
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
  const registry: KeyManifest = { sequence: 1, current: key.keyId, keys: [registeredKeyOf(key, Date.now())] }
  await publishKeyFile(key)

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
async function rotateSubordinateKey (): Promise<KeyManifest> {
  const { registry, version } = await loadOrBootstrapRegistry()
  const key = await createSubordinateKey()
  const at = Date.now()
  const rotated = withRotatedKey(registry, registeredKeyOf(key, at), at)

  // REG-3
  await publishKeyFile(key)
  await writeRegistry(rotated, version)
  return rotated
}

/**
 * Revokes a subordinate key, rotating first when it is the one currently signing.
 *
 * Rotating first is not tidiness: the registry recording the revocation must itself be signed, and
 * the instance needs a key it still trusts to do it. The revoked key's seed is discarded too —
 * useless against an adversary who already holds a copy, but it stops this instance from ever
 * signing with it again.
 *
 * **Everything the revoked key signed stops verifying**, so any document it signed must be re-signed
 * with the live key. The manifests are re-signed by the caller once manifest signing exists.
 */
async function revokeSubordinateKey (keyId: string): Promise<KeyManifest> {
  let { registry, version } = await loadOrBootstrapRegistry()

  if (registry.current === keyId) {
    await rotateSubordinateKey()
    const reloaded = await loadOrBootstrapRegistry()
    registry = reloaded.registry
    version = reloaded.version
  }

  const revoked = withRevokedKey(registry, keyId, Date.now())
  // REG-3
  await writeRegistry(revoked, version)
  await deleteKeyFile(keyId)
  await forgetSubordinateKey(keyId)
  return revoked
}

export {
  registryPath,
  MANIFEST_DOCUMENT,
  publishKeyFile,
  registeredKeyOf,
  loadRegistry,
  writeRegistry,
  loadOrBootstrapRegistry,
  rotateSubordinateKey,
  revokeSubordinateKey
}

export type {
  LoadedRegistry
}
