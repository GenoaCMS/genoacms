import { join } from 'path'
import {
  getInternalObjectJSON,
  uploadInternalObjectJSON
} from '$lib/script/storage/storage.server'
import {
  parseRolesManifest,
  parseUsersManifest,
  serializeRolesManifest,
  serializeUsersManifest,
  type ManifestParseResult,
  type UserRecord
} from './manifests'
import type { Role } from './roles'

/**
 * Storage of the authorization manifests in the primary private bucket.
 *
 * These are CMS-internal objects, not user-facing bucket contents, so no `storage:bucket:*`
 * permission is demanded here — a copywriter saving a page must not need bucket-write. The
 * permission governing who may change roles and users is `config:roles:manage` /
 * `config:users:manage`, and it belongs to the configuration service that calls these functions,
 * not to the storage primitive underneath them.
 *
 * **Nothing here verifies a signature.** The readers are named accordingly: what they return is
 * untrusted content that has been parsed, not content that may be acted upon. Verification and
 * the fail-closed resolution around it are a separate layer, and naming these functions for what
 * they actually do is what stops that layer from being skipped by accident.
 */

const securityDirectory = join('.genoacms', 'security')
const rolesManifestPath = join(securityDirectory, 'roles.json')
const usersManifestPath = join(securityDirectory, 'users.json')

async function readManifest<T> (
  path: string,
  parse: (raw: unknown) => ManifestParseResult<T>
): Promise<ManifestParseResult<T>> {
  let raw: unknown
  try {
    raw = await getInternalObjectJSON(path)
  } catch (error) {
    // Absent and unreadable are the same condition to a caller that must fail closed, but the
    // reason is carried through for the operational alert that reports it.
    return { ok: false, reason: `manifest-unreadable: ${path}: ${(error as Error).message}` }
  }
  return parse(raw)
}

async function readUnverifiedRolesManifest (): Promise<ManifestParseResult<Role[]>> {
  return await readManifest(rolesManifestPath, parseRolesManifest)
}

async function readUnverifiedUsersManifest (): Promise<ManifestParseResult<UserRecord[]>> {
  return await readManifest(usersManifestPath, parseUsersManifest)
}

async function writeRolesManifest (roles: Role[]): Promise<void> {
  await uploadInternalObjectJSON(rolesManifestPath, serializeRolesManifest(roles))
}

async function writeUsersManifest (users: UserRecord[]): Promise<void> {
  await uploadInternalObjectJSON(usersManifestPath, serializeUsersManifest(users))
}

export {
  securityDirectory,
  rolesManifestPath,
  usersManifestPath,
  readUnverifiedRolesManifest,
  readUnverifiedUsersManifest,
  writeRolesManifest,
  writeUsersManifest
}
