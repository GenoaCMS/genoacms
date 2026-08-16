import { join } from 'path'
import {
  defaultBucketId,
  getObjectString,
  uploadInternalObjectJSON
} from '$lib/script/storage/storage.server'
import {
  serializeRolesManifest,
  serializeUsersManifest,
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
 * Reading yields **raw bytes, not parsed objects**: a signature attests to what was written, so
 * verification has to run before parsing. Trust and parsing therefore live together one layer up,
 * in `resolution.server.ts`, and there is no function here that returns usable authorization data.
 */

const securityDirectory = join('.genoacms', 'security')
const rolesManifestPath = join(securityDirectory, 'roles.json')
const usersManifestPath = join(securityDirectory, 'users.json')

/** Throws when the object is absent or unreadable; the caller decides what that means. */
async function readRawManifest (path: string): Promise<string> {
  return await getObjectString({ bucket: defaultBucketId, name: path })
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
  readRawManifest,
  writeRolesManifest,
  writeUsersManifest
}
