import type { LayoutServerLoad } from './$types'
import type { PageEntry } from '$lib/script/components/page/entry/types'
import {
  getUserPageEntryVersioned
} from '$lib/script/components/page/user.server'
import { listUserComponentHeaders } from '$lib/script/components/componentHeader/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { error } from '@sveltejs/kit'
import { deserializePageEntry } from '$lib/script/components/page/entry'

export const load: LayoutServerLoad = async ({ params, locals, parent }) => {
  const ctx = requireAuthContext(locals)
  const { pageName } = params
  const parentData = await parent()

  const [read, componentSchemas, composableComponents] = await Promise.all([
    getUserPageEntryVersioned(ctx, pageName).catch(e => {
      console.log(e)
      return null
    }),
    listUserComponentHeaders(ctx),
    parentData.composableComponents
  ])

  if (read === null) {
    return error(404, { message: `No page named "${pageName}"` })
  }

  let page: PageEntry
  try {
    page = await deserializePageEntry(read.page)
  } catch {
    return error(500, { message: `Failed to deserialize page "${pageName}"` })
  }

  return {
    page,
    version: read.version ?? '',
    componentSchemas,
    composableComponents,
    canUndo: !!page.history.length,
    canRedo: !!page.future.length
  }
}
