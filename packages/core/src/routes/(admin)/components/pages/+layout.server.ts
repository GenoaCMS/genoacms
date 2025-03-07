import type { PageServerLoad } from './$types'
import { listOrCreatePageList } from '$lib/script/components/page/page.server'
import { listOrCreateComponentEntryList } from '$lib/script/components/componentEntry/io.server'

export const load: PageServerLoad = async () => {
  const [pages, componentSchemas] = await Promise.all([
    listOrCreatePageList(),
    listOrCreateComponentEntryList()
  ])

  return {
    pages,
    componentSchemas
  }
}
