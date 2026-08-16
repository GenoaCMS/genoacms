import { config } from '@genoacms/cloudabstraction'
import { isSeedAdmin } from './seedAdmin.server'
import {
  quarantineManifest,
  readRawManifest,
  rolesManifestPath,
  usersManifestPath,
  writeSignedManifest,
  ROLES_DOCUMENT,
  USERS_DOCUMENT
} from './manifests.server'
import { parseRolesManifest, parseUsersManifest, type ManifestParseResult, type UserRecord } from './manifests'
import { isPreconditionFailed } from '@genoacms/cloudabstraction/storage'
import { peekUnverifiedHeader, verify, type DocumentType } from '$lib/script/signing/envelope'
import { resolveVerificationKey } from '$lib/script/signing/keyResolution.server'
import { resolveSubject, type AuthorizationSource, type Resolution } from './resolution'
import type { Role } from './roles'
import type { JsonValue } from '$lib/script/signing/canonical'

/**
 * Loading authorization data from storage and resolving a principal against it.
 *
 * Every manifest is a signed envelope. There is no unsigned form and no setting that tolerates one:
 * empty signed manifests are created on first start, so a reader never meets a manifest without a
 * signature.
 *
 * A manifest that fails verification is **quarantined and replaced** with a fresh empty one. The
 * outcome is the same seed-administrator-only recovery mode as rejecting it outright — an empty
 * manifest grants nobody anything — but the administrator can sign in and rebuild rather than
 * repairing storage by hand, and the rejected document is preserved as evidence.
 */

/**
 * §4.2.4 requires an instance running degraded to say so rather than doing it quietly.
 * A real alerting channel replaces this; the call sites do not change when it does.
 */
function reportAuthorizationAlert (message: string): void {
  console.warn(`[genoacms:authorization] ${message}`)
}

const EMPTY_ROLES: JsonValue = { roles: {} }
const EMPTY_USERS: JsonValue = { users: {} }

/**
 * The roles a new instance starts with, declared in Tier-1 configuration.
 *
 * **Seeding, not authority.** These are written once, when `roles.json` does not exist. The manifest
 * owns them afterwards, so an administrator editing a role at runtime does not find it reverted by
 * the next deployment — roles are runtime configuration (§4.2.5), and Tier-1 only says where to
 * begin.
 *
 * A rejected manifest is **not** reseeded from here. Replacement is a recovery path and grants
 * nothing; restoring configured roles at the moment tampering is detected would hand back
 * permissions precisely when the least should be assumed.
 *
 * A malformed declaration fails startup rather than being skipped: it is Tier-1 configuration an
 * operator wrote deliberately, and silently ignoring it would leave an instance with fewer
 * permissions than its configuration describes, with nothing to say so.
 */
function configuredRoles (): JsonValue {
  const declared = config.security.roles
  if (declared === undefined || Object.keys(declared).length === 0) return EMPTY_ROLES

  const payload = { roles: declared } as unknown as JsonValue
  const parsed = parseRolesManifest(payload)
  if (!parsed.ok) {
    throw new Error(`security/invalid-roles: security.roles in genoa.config is not valid: ${parsed.reason}`)
  }
  return payload
}

type ManifestVerdict<T> =
  | { ok: true, value: T }
  | { ok: false, reason: string }

/**
 * Creates or replaces a manifest, tolerating only the loss of a race.
 *
 * A conditional write that fails its precondition means another instance got there first, which is
 * the outcome we wanted anyway. Anything else — no permission, no bucket — is a real failure and
 * must not be mistaken for a race.
 */
async function writeEmptyManifest (
  path: string,
  type: DocumentType,
  empty: JsonValue,
  expected?: string
): Promise<void> {
  try {
    await writeSignedManifest(path, type, empty, expected)
  } catch (error) {
    if (!isPreconditionFailed(error)) throw error
  }
}

const createEmptyManifest = async (path: string, type: DocumentType, empty: JsonValue): Promise<void> =>
  await writeEmptyManifest(path, type, empty)

const replaceManifest = async (path: string, type: DocumentType, empty: JsonValue, expected?: string): Promise<void> =>
  await writeEmptyManifest(path, type, empty, expected)

/**
 * Verifies and parses one manifest, replacing it when it is definitively bad.
 *
 * The distinction that matters is **verdict versus outage**. A failed signature, a key the registry
 * does not list, and a key it has revoked are verdicts: the manifest is bad and is replaced. Storage
 * or the registry being *unreachable* is not a verdict — those propagate, because replacing on a
 * transient failure would destroy authorization data merely because it could not be read.
 */
/**
 * @param initial what to write when the manifest is absent — the configured starting state
 * @param empty   what to write when one is rejected — nothing, regardless of configuration
 */
async function loadManifest<T> (
  path: string,
  type: DocumentType,
  parse: (raw: unknown) => ManifestParseResult<T>,
  initial: JsonValue,
  empty: JsonValue
): Promise<ManifestVerdict<T>> {
  const valueOf = (template: JsonValue): T => {
    const parsed = parse(template)
    // Our own template. If it does not parse, the schema and the template have diverged.
    if (!parsed.ok) throw new Error(`manifest/template-invalid: ${path}: ${parsed.reason}`)
    return parsed.value
  }

  let raw
  try {
    raw = await readRawManifest(path)
  } catch {
    // Absent — first start, or someone deleted it. Create it signed, so the unsigned state never
    // exists. Losing the race to create is not a failure: the winner wrote the same thing.
    await createEmptyManifest(path, type, initial)
    return { ok: true, value: valueOf(initial) }
  }

  const rejected = async (reason: string): Promise<ManifestVerdict<T>> => {
    const quarantinePath = await quarantineManifest(path, raw.text)
    await replaceManifest(path, type, empty, raw.version)
    reportAuthorizationAlert(
      `manifest-rejected: ${path}: ${reason}. Preserved at ${quarantinePath} and replaced with an ` +
      'empty signed manifest; permissions are seed-administrator-only until roles are rebuilt.'
    )
    return { ok: false, reason }
  }

  let candidate: unknown
  try {
    candidate = JSON.parse(raw.text)
  } catch {
    return await rejected('not JSON')
  }

  const header = peekUnverifiedHeader(candidate)
  if (header === undefined) return await rejected('not a signed envelope')

  // Throws when the registry cannot be read — an outage, not a verdict, and must not replace.
  const publicKey = await resolveVerificationKey(header.keyId)
  if (publicKey === undefined) {
    return await rejected(`signing key ${header.keyId} is unknown or revoked`)
  }

  const verified = verify(candidate, type, publicKey)
  if (!verified.valid) return await rejected(`signature: ${verified.reason}`)

  const parsed = parse(verified.payload)
  if (!parsed.ok) return await rejected(parsed.reason)

  return { ok: true, value: parsed.value }
}

/**
 * Both manifests or neither. Roles without users, or users without roles, is not a partial success —
 * it is a state in which permissions cannot be resolved correctly.
 */
async function loadAuthorizationSource (): Promise<{ source: AuthorizationSource, warnings: string[] }> {
  const roles = await loadManifest<Role[]>(
    rolesManifestPath, ROLES_DOCUMENT, parseRolesManifest, configuredRoles(), EMPTY_ROLES
  )
  if (!roles.ok) return { source: { available: false, reason: roles.reason }, warnings: [] }

  const users = await loadManifest<UserRecord[]>(
    usersManifestPath, USERS_DOCUMENT, parseUsersManifest, EMPTY_USERS, EMPTY_USERS
  )
  if (!users.ok) return { source: { available: false, reason: users.reason }, warnings: [] }

  return { source: { available: true, roles: roles.value, users: users.value }, warnings: [] }
}

/**
 * Resolves a subject to the permissions it holds on this instance.
 *
 * The seed administrator short-circuits **before storage is touched at all**. A recovery path that
 * needs the bucket to be readable is no recovery path for a bucket that is not.
 */
async function resolvePrincipal (subject: string): Promise<Resolution> {
  if (isSeedAdmin(subject)) {
    return resolveSubject(subject, true, { available: false, reason: 'seed-administrator-not-consulted' })
  }

  const { source, warnings } = await loadAuthorizationSource()
  const resolution = resolveSubject(subject, false, source)
  const allWarnings = [...warnings, ...resolution.warnings]
  allWarnings.forEach(reportAuthorizationAlert)
  return { ...resolution, warnings: allWarnings }
}

export {
  resolvePrincipal,
  loadAuthorizationSource
}
