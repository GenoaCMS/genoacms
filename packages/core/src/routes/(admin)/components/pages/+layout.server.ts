import { listOrCreatePageList } from '$lib/script/components/page/page.server'
import { listOrCreatePreBuiltComponentList } from '$lib/script/components/componentEntry/component.server'

export const load = async () => {
  const pages = await listOrCreatePageList()
  const componentSchemas = await listOrCreatePreBuiltComponentList()

  return {
    pages,
    componentSchemas
  }
}
