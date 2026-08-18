import { config } from '@genoacms/cloudabstraction'
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
import { parseDeclarations, mergeDeclarations, declarationsOnly, type Declarations } from './declared'
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
 * An instance running degraded must say so rather than doing it quietly.
 * A real alerting channel replaces this; the call sites do not change when it does.
 */
function reportAuthorizationAlert (message: string): void {
  console.warn(`[genoacms:authorization] ${message}`)
}

const EMPTY_ROLES: JsonValue = { roles: {} }
const EMPTY_USERS: JsonValue = { users: {} }

/**
 * The Tier-1 declarations, parsed once per read.
 *
 * **Merged when authorization is read, never written into the manifests.** Deleting
 * a declaration from `genoa.config` therefore removes it and revokes the access it granted; nothing
 * was persisted, so nothing is left behind to keep honouring.
 *
 * This supersedes the former seeding behaviour, where declarations were written into `roles.json`
 * at first start and owned by the manifest thereafter — under which a declaration could be edited
 * at runtime and a deleted one would survive.
 *
 * A malformed declaration fails rather than being skipped: it is Tier-1 configuration an operator
 * wrote deliberately, and ignoring it would leave an instance with less authority than its
 * configuration describes, with nothing to say so.
 */
function declarations (): Declarations {
  const parsed = parseDeclarations(config.security.roles, config.security.assignments)
  if (!parsed.ok) throw new Error(`security/invalid-declarations: ${parsed.reason}`)
  return parsed.value
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
  const declared = declarations()

  const roles = await loadManifest<Role[]>(
    rolesManifestPath, ROLES_DOCUMENT, parseRolesManifest, EMPTY_ROLES, EMPTY_ROLES
  )
  const users = roles.ok
    ? await loadManifest<UserRecord[]>(usersManifestPath, USERS_DOCUMENT, parseUsersManifest, EMPTY_USERS, EMPTY_USERS)
    : undefined

  // Stored authorization unreadable — the recovery case that replaced the seed administrator. The
  // declarations still resolve, because they never depended on storage, so the subjects
  // configuration names can act while nobody else can. This is the whole reason a privileged
  // identity is no longer needed.
  if (!roles.ok || users === undefined || !users.ok) {
    const reason = roles.ok ? (users?.ok === false ? users.reason : 'users-unavailable') : roles.reason
    const merged = declarationsOnly(declared)
    return {
      source: { available: true, roles: merged.roles, users: merged.users, declarationsOnly: true },
      warnings: [`stored-authorization-unavailable: ${reason}. Only Tier-1 declarations are in effect.`]
    }
  }

  const merged = mergeDeclarations(declared, { roles: roles.value, users: users.value })
  return {
    source: { available: true, roles: merged.roles, users: merged.users },
    warnings: []
  }
}

/**
 * Resolves a subject to the permissions it holds on this instance.
 *
 * There is no privileged identity to short-circuit for. Tier-1 declarations are merged into the
 * source, and remain in effect on their own when the stored authorization cannot be read — so the
 * recovery path never depends on the bucket being readable.
 */
async function resolvePrincipal (subject: string): Promise<Resolution> {
  const { source, warnings } = await loadAuthorizationSource()
  const resolution = resolveSubject(subject, source)
  const allWarnings = [...warnings, ...resolution.warnings]
  allWarnings.forEach(reportAuthorizationAlert)
  return { ...resolution, warnings: allWarnings }
}

export {
  resolvePrincipal,
  loadAuthorizationSource
}
