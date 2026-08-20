import { join } from 'path'
import {
  defaultBucketId,
  getObject,
  uploadObject
} from '$lib/script/storage/storage.server'
import { streamToString } from '$lib/script/utils.server'
import { sign, type DocumentType } from '$lib/script/signing/envelope'
import { getCurrentSigningKey } from '$lib/script/signing/keyResolution.server'
import {
  serializeRolesManifest,
  serializeUsersManifest,
  type UserRecord
} from './manifests'
import type { Role } from './roles'
import type { JsonValue } from '$lib/script/signing/canonical'

/**
 * Storage of the authorization manifests in the primary private bucket.
 *
 * These are CMS-internal objects, not user-facing bucket contents, so no `storage:bucket:*`
 * permission is demanded here — a copywriter saving a page must not need bucket-write. The
 * permission governing who may change roles and users is `config:roles:manage` /
 * `config:users:manage`, and it belongs to the configuration service that calls these functions.
 *
 * Every manifest is written **signed**. There is no unsigned form: an empty signed manifest is
 * created on first start, so "not yet signed" is not a state a reader ever has to handle.
 */

const securityDirectory = join('.genoacms', 'security')
const rejectedDirectory = join(securityDirectory, 'rejected')
const rolesManifestPath = join(securityDirectory, 'roles.json')
const usersManifestPath = join(securityDirectory, 'users.json')

const ROLES_DOCUMENT: DocumentType = 'genoacms.roles.v1'
const USERS_DOCUMENT: DocumentType = 'genoacms.users.v1'

interface RawManifest {
  text: string
  version?: string
}

/** Throws when the object is absent or unreadable; the caller decides what that means. */
async function readRawManifest (path: string): Promise<RawManifest> {
  const object = await getObject({ bucket: defaultBucketId, name: path })
  return { text: await streamToString(object.data), version: object.version }
}

/**
 * Writes a signed manifest.
 *
 * `expected` is the version the caller read, or `undefined` to require that the object is new. Both
 * forms are conditional, so two instances replacing the same rejected manifest do not both write.
 */
async function writeSignedManifest (
  path: string,
  type: DocumentType,
  payload: JsonValue,
  expected?: string
): Promise<void> {
  const envelope = sign(type, payload, await getCurrentSigningKey())
  await uploadObject(
    { bucket: defaultBucketId, name: path },
    JSON.stringify(envelope),
    expected === undefined ? { ifAbsent: true } : { ifVersion: expected }
  )
}

async function writeRolesManifest (roles: Role[], expected?: string): Promise<void> {
  await writeSignedManifest(rolesManifestPath, ROLES_DOCUMENT, serializeRolesManifest(roles) as unknown as JsonValue, expected)
}

async function writeUsersManifest (users: UserRecord[], expected?: string): Promise<void> {
  await writeSignedManifest(usersManifestPath, USERS_DOCUMENT, serializeUsersManifest(users) as unknown as JsonValue, expected)
}

/**
 * Preserves a manifest that failed verification, before it is replaced.
 *
 * The rejected document is the only evidence of what was attempted. Destroying it at the moment
 * tampering is detected discards precisely what an investigation would need, and the cost is one
 * write on a path that should almost never run.
 */
async function quarantineManifest (path: string, contents: string): Promise<string> {
  const name = path.split('/').pop() ?? 'manifest.json'
  const stem = name.replace(/\.json$/, '')
  const quarantinePath = join(rejectedDirectory, `${stem}-${Date.now()}.json`)
  await uploadObject({ bucket: defaultBucketId, name: quarantinePath }, contents, {})
  return quarantinePath
}

export {
  securityDirectory,
  rejectedDirectory,
  rolesManifestPath,
  usersManifestPath,
  ROLES_DOCUMENT,
  USERS_DOCUMENT,
  readRawManifest,
  writeSignedManifest,
  writeRolesManifest,
  writeUsersManifest,
  quarantineManifest
}

export type {
  RawManifest
}
