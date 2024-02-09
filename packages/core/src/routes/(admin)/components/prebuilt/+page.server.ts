import { listOrCreatePreBuiltComponentList } from '$lib/script/components.server'

export const load = async () => {
  const components = await listOrCreatePreBuiltComponentList()
  return {
    components
  }
}
