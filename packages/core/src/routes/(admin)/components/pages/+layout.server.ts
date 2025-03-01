import type { PageServerLoad } from './$types'
import { listOrCreatePageList } from '$lib/script/components/page/page.server'
import { listOrCreatePreBuiltComponentList } from '$lib/script/components/componentEntry/component.server'

export const load: PageServerLoad = async () => {
  const [pages, componentSchemas] = await Promise.all([
    listOrCreatePageList(),
    listOrCreatePreBuiltComponentList()
  ])

  return {
    pages,
    componentSchemas
  }
}
