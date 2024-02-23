import {
  getPageEntry
} from '$lib/script/components/page/page.server'
import { error } from '@sveltejs/kit'
import type { PageEntry } from '$lib/script/components/page/entry/types'

export const load = async ({ params }) => {
  const { pageName } = params
  let page: PageEntry
  try {
    page = await getPageEntry(pageName)
  } catch (e) {
    return error(404, { message: `No page named "${pageName}"` })
  }
  return {
    page,
    canUndo: !!page.history.length,
    canRedo: !!page.future.length
  }
}
