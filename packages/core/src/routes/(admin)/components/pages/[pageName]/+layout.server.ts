import type { IsSerializable, PageEntry } from '$lib/script/components/page/entry/types'
import {
  getUserPageEntry
} from '$lib/script/components/page/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { error } from '@sveltejs/kit'
import { deserializePageEntry } from '$lib/script/components/page/entry'

export const load = async ({ params, locals }) => {
  const ctx = requireAuthContext(locals)
  const { pageName } = params
  let serializedPage: PageEntry<IsSerializable>
  let page: PageEntry
  try {
    serializedPage = await getUserPageEntry(ctx, pageName)
  } catch (e) {
    console.log(e)
    return error(404, { message: `No page named "${pageName}"` })
  }
  try {
    page = await deserializePageEntry(serializedPage)
  } catch {
    return error(500, { message: `Failed to deserialize page "${pageName}"` })
  }
  return {
    page,
    canUndo: !!page.history.length,
    canRedo: !!page.future.length
  }
}
