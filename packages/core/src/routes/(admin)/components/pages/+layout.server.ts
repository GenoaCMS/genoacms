import type { LayoutServerLoad } from './$types'
import { listUserComponentEntries } from '$lib/script/components/componentEntry/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'

export const load: LayoutServerLoad = async ({ locals }) => {
  const componentSchemas = await listUserComponentEntries(requireAuthContext(locals))

  return {
    componentSchemas
  }
}
