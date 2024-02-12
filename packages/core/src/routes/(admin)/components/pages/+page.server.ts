import { listOrCreatePageList } from '$lib/script/components/components.server'

export const load = async () => {
  const pages = await listOrCreatePageList()
  return {
    pages
  }
}
