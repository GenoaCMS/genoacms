import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DirectoryContents } from '@genoacms/contracts/storage'
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

vi.mock('$lib/script/host.server', () => ({ host: { defaultBucket: 'media' } }))

vi.mock('./storage.server', () => {
  const record = (name: string) => async (reference: { bucket: string, name: string }) => {
    calls.push(`${name}:${reference.bucket}/${reference.name}`)
    return { data: 'contents', name: reference.name }
  }
  return {
    defaultBucketId: 'media',
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
const media = (name: string) => ({ bucket: 'media', name })

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
  it('STS-2: is denied without the read permission', async () => {
    await expectDenied(() => storage.listUserDirectory(nobody(), { bucket: 'media', name: 'folder' }))
  })

  it('STS-2: is allowed with it', async () => {
    await storage.listUserDirectory(reader(), { bucket: 'media', name: 'folder' })
    expect(calls).toEqual(['listDirectory:media/folder'])
  })

  it('STS-2, STS-3: does not carry from one bucket to another', async () => {
    // The grant names `media`. A bucket-scoped permission is not an instance-wide one.
    await expectDenied(() => storage.listUserDirectory(reader(), { bucket: 'private', name: 'folder' }))
  })

  it('STS-2: covers decorating a listing, which mints a URL per object', async () => {
    // A signed URL is access to the object, so producing a decorated listing is a read.
    await expectDenied(() => storage.processUserDirectoryContents(nobody(), 'media', directoryContents))
  })
})

describe('writing', () => {
  it('STS-2: is denied to a reader', async () => {
    await expectDenied(() => storage.uploadUserObject(reader(), mediaObject, 'data'))
    await expectDenied(() => storage.createUserDirectory(reader(), { bucket: 'media', name: 'folder/' }))
  })

  it('STS-2: is allowed with the write permission', async () => {
    await storage.uploadUserObject(writer(), mediaObject, 'data')
    expect(calls).toEqual(['uploadObject:media/photo.jpg'])
  })

  it('STS-2, STS-3: does not imply reading', async () => {
    // Write-only is a real role: an upload path that must not be able to browse the bucket.
    await expectDenied(() => storage.listUserDirectory(writer(), { bucket: 'media', name: 'folder' }))
  })
})

describe('moving', () => {
  it('STS-2, STS-3: needs write rather than delete', async () => {
    await storage.moveUserObject(writer(), mediaObject, 'moved.jpg')
    expect(calls).toEqual(['moveObject:media/photo.jpg'])

    calls.length = 0
    await storage.moveUserDirectory(writer(), { bucket: 'media', name: 'folder/' }, 'other/')
    expect(calls).toEqual(['moveDirectory:media/folder/'])
  })

  it('STS-2, STS-3: is denied to a principal holding only delete', async () => {
    await expectDenied(() => storage.moveUserObject(deleter(), mediaObject, 'moved.jpg'))
    await expectDenied(() => storage.moveUserDirectory(deleter(), { bucket: 'media', name: 'folder/' }, 'other/'))
  })
})

describe('deleting', () => {
  it('STS-2: is denied to a writer', async () => {
    // Otherwise write access would silently include destruction, and the third permission would
    // describe nothing.
    await expectDenied(() => storage.deleteUserObject(writer(), mediaObject))
    await expectDenied(() => storage.deleteUserDirectory(writer(), { bucket: 'media', name: 'folder/' }))
  })

  it('STS-2: is allowed with the delete permission', async () => {
    await storage.deleteUserObject(deleter(), mediaObject)
    expect(calls).toEqual(['deleteObject:media/photo.jpg'])
  })
})

describe('getUserBucketReferences', () => {
  it('STS-1: returns only buckets the principal holds a grant on', () => {
    const context = contextWith([
      bucketGrant('storage:bucket:read', 'media'),
      bucketGrant('storage:bucket:read', 'archive')
    ])

    expect(storage.getUserBucketReferences(context).map(b => b.name)).toEqual(['media', 'archive'])
  })

  it('STS-1: returns nothing to a principal with no grants', () => {
    // Filtering rather than denying: navigation offers nothing rather than offering a denial.
    expect(storage.getUserBucketReferences(nobody())).toEqual([])
  })

  it('STS-1: shows a bucket the principal may write but not read', () => {
    // The catalog is filtered over *any* bucket-scoped grant, not `read` alone. Filtering
    // on read would hide the destination of an upload this principal is permitted to perform.
    expect(storage.getUserBucketReferences(writer()).map(b => b.name)).toEqual(['media'])
  })

  it('STS-1: returns every bucket to a wildcard grant', () => {
    const superAdmin = contextWith([{ permission: WILDCARD, resource: WILDCARD }])
    expect(storage.getUserBucketReferences(superAdmin).map(b => b.name))
      .toEqual(['media', 'private', 'archive'])
  })
})

describe('the denial message', () => {
  it('STS-2: a denial names the subject, the permission and the bucket, and calls no adapter', async () => {
    await expect(Promise.resolve().then(async () => await storage.listUserDirectory(nobody(), { bucket: 'media', name: 'folder/' })))
      .rejects.toMatchObject({ message: "permission-denied: 'subject-1' lacks storage:bucket:read on 'media'" })
    expect(calls).toEqual([])
  })
})

describe('the CMS state under .genoacms/', () => {
  const everything = () => contextWith(['read', 'write', 'delete'].map(permission => bucketGrant(`storage:bucket:${permission}` as Permission, 'media')))
  const internal = (name: string) => `storage/internal-read-only: ${name}`
  const refusedOperations = (context: () => AuthContext): Array<[string, string, () => unknown]> => [
    ['upload of an object', '.genoacms/x', () => storage.uploadUserObject(context(), media('.genoacms/x'), 'data')],
    ['move of an object', '.genoacms/x', () => storage.moveUserObject(context(), media('.genoacms/x'), 'photos/x')],
    ['rename of an object', '.genoacms/x', () => storage.moveUserObject(context(), media('.genoacms/x'), '.genoacms/y')],
    ['delete of an object', '.genoacms/x', () => storage.deleteUserObject(context(), media('.genoacms/x'))],
    ['creation of .genoacms/', '.genoacms/', () => storage.createUserDirectory(context(), media('.genoacms/'))],
    ['move of .genoacms/', '.genoacms/', () => storage.moveUserDirectory(context(), media('.genoacms/'), 'photos/')],
    ['rename of .genoacms/', '.genoacms/', () => storage.moveUserDirectory(context(), media('.genoacms/'), 'state/')],
    ['delete of .genoacms/', '.genoacms/', () => storage.deleteUserDirectory(context(), media('.genoacms/'))],
    ['creation of .genoacms/sub/', '.genoacms/sub/', () => storage.createUserDirectory(context(), media('.genoacms/sub/'))],
    ['move of .genoacms/sub/', '.genoacms/sub/', () => storage.moveUserDirectory(context(), media('.genoacms/sub/'), 'photos/')],
    ['rename of .genoacms/sub/', '.genoacms/sub/', () => storage.moveUserDirectory(context(), media('.genoacms/sub/'), 'sub/')],
    ['delete of .genoacms/sub/', '.genoacms/sub/', () => storage.deleteUserDirectory(context(), media('.genoacms/sub/'))],
    ['move of an object into .genoacms/', '.genoacms/a', () => storage.moveUserObject(context(), media('photos/a'), '.genoacms/a')],
    ['move of a directory into .genoacms/', '.genoacms/d/', () => storage.moveUserDirectory(context(), media('photos/d/'), '.genoacms/d/')]
  ]

  it('STS-5: every change under .genoacms/ in the default bucket is refused, after the permission', async () => {
    for (const [operation, name, run] of refusedOperations(everything)) {
      await expect(Promise.resolve().then(run), operation).rejects.toMatchObject({ message: internal(name) })
      expect(calls, operation).toEqual([])
    }
    for (const [operation, , run] of refusedOperations(nobody)) {
      await expect(Promise.resolve().then(run), operation).rejects.toBeInstanceOf(PermissionDeniedError)
      expect(calls, operation).toEqual([])
    }
  })

  it('STS-5: reads under .genoacms/, other buckets, and other names are not affected', async () => {
    await storage.listUserDirectory(reader(), media('.genoacms/'))
    expect(calls).toEqual(['listDirectory:media/.genoacms/'])

    calls.length = 0
    await storage.uploadUserObject(contextWith([bucketGrant('storage:bucket:write', 'private')]), { bucket: 'private', name: '.genoacms/x' }, 'data')
    await storage.uploadUserObject(writer(), media('.genoacmsx/y'), 'data')
    await storage.createUserDirectory(writer(), media('photos/.genoacms/'))
    expect(calls).toEqual(['uploadObject:private/.genoacms/x', 'uploadObject:media/.genoacmsx/y', 'createDirectory:media/photos/.genoacms/'])
  })
})

// Last in the file: it unmounts the stubbed storage service, which the tests above rely on.
describe('a listing', () => {
  const NOW = Date.UTC(2026, 9, 18, 12, 0, 0)
  const ONE_HOUR_MS = 3600 * 1000

  afterEach(() => { vi.useRealTimers() })

  it('STS-4: a listing gives each file its filename and a URL signed for one hour, and carries next', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const adapter = {
      listDirectory: vi.fn(async () => ({
        files: [{ name: 'photos/2024/a.png', size: 1, lastModified: new Date(0) }],
        directories: [{ bucket: 'media', name: 'photos/2024/d/' }],
        next: 't'
      })),
      getSignedURL: vi.fn(async (reference: { name: string }) => `signed://${reference.name}`)
    }
    const host = { defaultBucket: 'media', storageForBucket: async () => adapter }
    vi.resetModules()
    vi.doUnmock('./storage.server')
    vi.doMock('$lib/script/host.server', () => ({ host }))
    const unstubbed = await import('./user.server')

    const page = await unstubbed.listUserDirectory(reader(), media('photos/2024/'), { pageToken: 'previous' })
    const listing = await unstubbed.processUserDirectoryContents(reader(), 'media', page)

    expect(adapter.listDirectory).toHaveBeenCalledWith({ bucket: 'media', name: 'photos/2024/' }, expect.objectContaining({ pageToken: 'previous' }))
    expect(adapter.getSignedURL).toHaveBeenCalledOnce()
    const [signedReference, expires] = adapter.getSignedURL.mock.calls[0] as unknown as [{ name: string }, Date | number]
    expect(signedReference).toEqual({ bucket: 'media', name: 'photos/2024/a.png' })
    expect(Number(expires)).toBe(NOW + ONE_HOUR_MS)
    expect(listing.files).toEqual([expect.objectContaining({ name: 'photos/2024/a.png', filename: 'a.png', signedURL: 'signed://photos/2024/a.png' })])
    expect(listing.directories).toEqual([{ bucket: 'media', name: 'photos/2024/d/' }])
    expect((listing as { next?: string }).next).toBe('t')
  })
})
