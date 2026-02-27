import type { PageServerLoad } from './$types'
import { listOrCreateComponentEntryList } from '$lib/script/components/componentEntry/io.server'

export const load: PageServerLoad = async () => {
  const componentSchemas = await listOrCreateComponentEntryList()

  return {
    componentSchemas
  }
}
