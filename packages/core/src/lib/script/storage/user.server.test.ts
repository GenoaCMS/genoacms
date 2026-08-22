import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DirectoryContents } from '@genoacms/cloudabstraction/storage'
import type { Grant } from '$lib/script/authorization/grants'
import type { Permission } from '$lib/script/authorization/permissions'
import type { AuthContext } from '$lib/script/authorization/context'

/**
 * Enforcement in the user-facing storage layer.
 *
 * The claim under test is that the check lives **with the operation**, so it holds however the
 * operation is reached — not at the route, where a new call site can forget it. Each case therefore
 * calls the service directly, the way a service-to-service caller would.
 *
 * The **primary** layer is stubbed and records what reached it, because "denied" has to mean the
 * underlying operation was never performed. A test asserting only that a rejection happened would
 * pass just as well if the object had already been deleted before the check ran.
 *
 * It also pins the boundary the author drew: the primary operations stay unprivileged, so nothing
 * here asserts that `storage.server` refuses anything. What is asserted is that the user-facing
 * wrapper never reaches it without the permission.
 */

const calls: string[] = []

let directoryContents: DirectoryContents = { directories: [], files: [] }

vi.mock('./storage.server', () => {
  const record = (name: string) => async (reference: { bucket: string, name: string }) => {
    calls.push(`${name}:${reference.bucket}/${reference.name}`)
    return { data: 'contents', name: reference.name }
  }
  return {
    getBucketReferences: () => [{ name: 'media' }, { name: 'private' }, { name: 'archive' }],
    uploadObject: record('uploadObject'),
    moveObject: record('moveObject'),
    deleteObject: record('deleteObject'),
    listDirectory: async (reference: { bucket: string, name: string }) => {
      calls.push(`listDirectory:${reference.bucket}/${reference.name}`)
      return directoryContents
    },
    createDirectory: record('createDirectory'),
    moveDirectory: record('moveDirectory'),
    deleteDirectory: record('deleteDirectory'),
    processDirectoryContents: async (bucketId: string) => {
      calls.push(`processDirectoryContents:${bucketId}`)
      return { directories: [], files: [] }
    }
  }
})

const { createAuthContext } = await import('$lib/script/authorization/context')
const { WILDCARD } = await import('$lib/script/authorization/grants')
const { PermissionDeniedError } = await import('$lib/script/authorization/enforce')
const storage = await import('./user.server')

const bucketGrant = (permission: Permission, id: string): Grant =>
  ({ permission, resource: { scope: 'bucket', id } } as Grant)

const contextWith = (grants: Grant[]): AuthContext => createAuthContext('subject-1', grants)

const reader = () => contextWith([bucketGrant('storage:bucket:read', 'media')])
const writer = () => contextWith([bucketGrant('storage:bucket:write', 'media')])
const deleter = () => contextWith([bucketGrant('storage:bucket:delete', 'media')])
const nobody = () => contextWith([])

const mediaObject = { bucket: 'media', name: 'photo.jpg' }

beforeEach(() => {
  calls.length = 0
  directoryContents = { directories: [], files: [] }
})

/**
 * Denied must mean the primary operation was never reached, not merely that an error surfaced.
 *
 * Takes a thunk so a synchronous throw is asserted the same way as a rejected promise.
 */
const expectDenied = async (operation: () => unknown): Promise<void> => {
  await expect(Promise.resolve().then(operation)).rejects.toBeInstanceOf(PermissionDeniedError)
  expect(calls).toEqual([])
}

describe('reading', () => {
  it('is denied without the read permission', async () => {
    await expectDenied(() => storage.listUserDirectory(nobody(), { bucket: 'media', name: 'folder' }))
  })

  it('is allowed with it', async () => {
    await storage.listUserDirectory(reader(), { bucket: 'media', name: 'folder' })
    expect(calls).toEqual(['listDirectory:media/folder'])
  })

  it('does not carry from one bucket to another', async () => {
    // The grant names `media`. A bucket-scoped permission is not an instance-wide one.
    await expectDenied(() => storage.listUserDirectory(reader(), { bucket: 'private', name: 'folder' }))
  })

  it('covers decorating a listing, which mints a URL per object', async () => {
    // A signed URL is access to the object, so producing a decorated listing is a read.
    await expectDenied(() => storage.processUserDirectoryContents(nobody(), 'media', directoryContents))
  })
})

describe('writing', () => {
  it('is denied to a reader', async () => {
    await expectDenied(() => storage.uploadUserObject(reader(), mediaObject, 'data'))
    await expectDenied(() => storage.createUserDirectory(reader(), { bucket: 'media', name: 'folder/' }))
  })

  it('is allowed with the write permission', async () => {
    await storage.uploadUserObject(writer(), mediaObject, 'data')
    expect(calls).toEqual(['uploadObject:media/photo.jpg'])
  })

  it('does not imply reading', async () => {
    // Write-only is a real role: an upload path that must not be able to browse the bucket.
    await expectDenied(() => storage.listUserDirectory(writer(), { bucket: 'media', name: 'folder' }))
  })
})

describe('moving', () => {
  it('needs write rather than delete', async () => {
    await storage.moveUserObject(writer(), mediaObject, 'moved.jpg')
    expect(calls).toEqual(['moveObject:media/photo.jpg'])

    calls.length = 0
    await storage.moveUserDirectory(writer(), { bucket: 'media', name: 'folder/' }, 'other/')
    expect(calls).toEqual(['moveDirectory:media/folder/'])
  })

  it('is denied to a principal holding only delete', async () => {
    await expectDenied(() => storage.moveUserObject(deleter(), mediaObject, 'moved.jpg'))
    await expectDenied(() => storage.moveUserDirectory(deleter(), { bucket: 'media', name: 'folder/' }, 'other/'))
  })
})

describe('deleting', () => {
  it('is denied to a writer', async () => {
    // Otherwise write access would silently include destruction, and the third permission would
    // describe nothing.
    await expectDenied(() => storage.deleteUserObject(writer(), mediaObject))
    await expectDenied(() => storage.deleteUserDirectory(writer(), { bucket: 'media', name: 'folder/' }))
  })

  it('is allowed with the delete permission', async () => {
    await storage.deleteUserObject(deleter(), mediaObject)
    expect(calls).toEqual(['deleteObject:media/photo.jpg'])
  })
})

describe('getUserBucketReferences', () => {
  it('returns only buckets the principal holds a grant on', () => {
    const context = contextWith([
      bucketGrant('storage:bucket:read', 'media'),
      bucketGrant('storage:bucket:read', 'archive')
    ])

    expect(storage.getUserBucketReferences(context).map(b => b.name)).toEqual(['media', 'archive'])
  })

  it('returns nothing to a principal with no grants', () => {
    // Filtering rather than denying: navigation offers nothing rather than offering a denial.
    expect(storage.getUserBucketReferences(nobody())).toEqual([])
  })

  it('shows a bucket the principal may write but not read', () => {
    // The catalogue is filtered over *any* bucket-scoped grant, not `read` alone. Filtering
    // on read would hide the destination of an upload this principal is permitted to perform.
    expect(storage.getUserBucketReferences(writer()).map(b => b.name)).toEqual(['media'])
  })

  it('returns every bucket to a wildcard grant', () => {
    const superAdmin = contextWith([{ permission: WILDCARD, resource: WILDCARD }])
    expect(storage.getUserBucketReferences(superAdmin).map(b => b.name))
      .toEqual(['media', 'private', 'archive'])
  })
})
