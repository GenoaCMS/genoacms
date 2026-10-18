import { describe, it, expectTypeOf } from 'vitest'
import type { Adapter, UploadOptions, DirectoryListingParams, DirectoryContents, StorageObject, ObjectReference } from '@genoacms/contracts/storage'

describe('the types that cross the contract', () => {
  it('STOR-1: the types that cross the contract', () => {
    expectTypeOf<UploadOptions>().toEqualTypeOf<{ ifVersion?: string, ifAbsent?: boolean }>()
    expectTypeOf<DirectoryListingParams>().toEqualTypeOf<{ startAfter?: string, limit?: number, pageToken?: string }>()
    expectTypeOf<DirectoryContents>().toEqualTypeOf<{ files: StorageObject[], directories: ObjectReference[], next?: string }>()
    const withoutListDirectory = {} as Omit<Adapter, 'listDirectory'>
    // @ts-expect-error an adapter missing a method does not type-check
    const incomplete: Adapter = withoutListDirectory
    expectTypeOf(incomplete).toEqualTypeOf<Adapter>()
  })
})
