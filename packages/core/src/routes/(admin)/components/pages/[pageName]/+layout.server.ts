import {
  deserializePage,
  getPage
} from '$lib/script/components/page/page.server'
import { error } from '@sveltejs/kit'
import type { SerializedPage } from '$lib/script/components/page/types'

export const load = async ({ params }) => {
  const { pageName } = params
  let serializedPage: SerializedPage
  try {
    serializedPage = await getPage(pageName)
  } catch (e) {
    return error(404, { message: `No page named "${pageName}"` })
  }
  const page = await deserializePage(serializedPage)
  return {
    page
  }
}

