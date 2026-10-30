import { query, getRequestEvent } from '$app/server'
import { error } from '@sveltejs/kit'
import { listUserDirectory, processUserDirectoryContents } from '#lib/script/storage/user.server.js'
import { requireAuthContext } from '#lib/script/authorization/request.server.js'
import { PermissionDeniedError } from '#lib/script/authorization/enforce.js'

interface NextPageRequest {
  bucket: string
  directory: string
  pageToken: string
}

// BRW-15, STS-4, BRW-16
export const nextPage = query('unchecked', async ({ bucket, directory, pageToken }: NextPageRequest) => {
  const ctx = requireAuthContext(getRequestEvent().locals)
  try {
    const page = await listUserDirectory(ctx, { bucket, name: directory }, { pageToken })
    return await processUserDirectoryContents(ctx, bucket, page)
  } catch (caught) {
    if (caught instanceof PermissionDeniedError) error(403, 'permission-denied')
    throw caught
  }
})
