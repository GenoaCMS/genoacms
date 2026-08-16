import { config } from '@genoacms/cloudabstraction'
import { isSeedAdmin } from './seedAdmin.server'
import { readRawManifest, rolesManifestPath, usersManifestPath } from './manifests.server'
import { parseRolesManifest, parseUsersManifest, type ManifestParseResult, type UserRecord } from './manifests'
import {
  DEFAULT_MANIFEST_TRUST,
  decideTrust,
  isManifestTrustPolicy,
  unverifiedManifestVerifier,
  type ManifestTrustPolicy
} from './verifier'
import { resolveSubject, type AuthorizationSource, type Resolution } from './resolution'
import type { Role } from './roles'

/**
 * Loading authorization data from storage and resolving a principal against it.
 *
 * This is the fail-closed boundary. A manifest reaches the resolver only after it has been read,
 * trusted under the instance's policy, and parsed; failing any of those yields an unavailable
 * source, and an unavailable source grants nothing.
 */

const verifier = unverifiedManifestVerifier

function resolveTrustPolicy (): ManifestTrustPolicy {
  const configured = config.security.manifestTrust
  if (configured === undefined) return DEFAULT_MANIFEST_TRUST
  if (!isManifestTrustPolicy(configured)) {
    // An unreadable policy is not an invitation to pick one.
    throw new Error(`invalid-manifest-trust-policy: ${String(configured)}`)
  }
  return configured
}

const manifestTrust = resolveTrustPolicy()

/**
 * §4.2.4 requires an instance running degraded to say so rather than doing it quietly.
 * A real alerting channel replaces this; the call sites do not change when it does.
 */
function reportAuthorizationAlert (message: string): void {
  console.warn(`[genoacms:authorization] ${message}`)
}

type LoadedManifest<T> =
  | { ok: true, value: T, verified: boolean }
  | { ok: false, reason: string }

async function loadManifest<T> (
  path: string,
  parse: (raw: unknown) => ManifestParseResult<T>
): Promise<LoadedManifest<T>> {
  let raw: string
  try {
    raw = await readRawManifest(path)
  } catch (error) {
    return { ok: false, reason: `manifest-unreadable: ${path}: ${(error as Error).message}` }
  }

  const decision = decideTrust(await verifier.verify(path, raw), manifestTrust)
  if (!decision.trusted) return { ok: false, reason: `manifest-untrusted: ${path}: ${decision.reason}` }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, reason: `manifest-not-json: ${path}` }
  }

  const parsed = parse(json)
  if (!parsed.ok) return { ok: false, reason: parsed.reason }
  return { ok: true, value: parsed.value, verified: decision.verified }
}

/**
 * Both manifests or neither. Roles without users, or users without roles, is not a partial
 * success — it is a state in which permissions cannot be resolved correctly.
 */
async function loadAuthorizationSource (): Promise<{ source: AuthorizationSource, warnings: string[] }> {
  const roles: LoadedManifest<Role[]> = await loadManifest(rolesManifestPath, parseRolesManifest)
  if (!roles.ok) return { source: { available: false, reason: roles.reason }, warnings: [] }

  const users: LoadedManifest<UserRecord[]> = await loadManifest(usersManifestPath, parseUsersManifest)
  if (!users.ok) return { source: { available: false, reason: users.reason }, warnings: [] }

  const warnings = roles.verified && users.verified
    ? []
    : ['integrity-unverified: acting on authorization manifests whose signatures were not checked']

  return { source: { available: true, roles: roles.value, users: users.value }, warnings }
}

/**
 * Resolves a subject to the permissions it holds on this instance.
 *
 * The seed administrator short-circuits **before storage is touched at all**. A recovery path that
 * needs the bucket to be readable is not a recovery path for a bucket that is not.
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
  manifestTrust,
  resolvePrincipal,
  loadAuthorizationSource
}
