import {
  getPage
} from '$lib/script/components/page/page.server'
import { error } from '@sveltejs/kit'
import type { PageEntry } from '$lib/script/components/page/entry'

export const load = async ({ params }) => {
  const { pageName } = params
  let serializedPage: PageEntry
  try {
    serializedPage = await getPage(pageName)
  } catch (e) {
    return error(404, { message: `No page named "${pageName}"` })
  }
  // const page = await deserializePage(serializedPage)
  return {
    page: serializedPage
  }
}
