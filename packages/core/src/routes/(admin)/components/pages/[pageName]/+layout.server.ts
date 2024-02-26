import type { IsSerializable, PageEntry } from '$lib/script/components/page/entry/types'
import {
  getPageEntry
} from '$lib/script/components/page/page.server'
import { error } from '@sveltejs/kit'
import { deserializePageEntry } from '$lib/script/components/page/entry'

export const load = async ({ params }) => {
  const { pageName } = params
  let serializedPage: PageEntry<IsSerializable>
  let page: PageEntry
  try {
    serializedPage = await getPageEntry(pageName)
  } catch (e) {
    return error(404, { message: `No page named "${pageName}"` })
  }
  try {
    page = await deserializePageEntry(serializedPage)
  } catch (e) {
    return error(500, { message: `Failed to deserialize page "${pageName}"` })
  }
  return {
    page,
    canUndo: !!page.history.length,
    canRedo: !!page.future.length
  }
}
