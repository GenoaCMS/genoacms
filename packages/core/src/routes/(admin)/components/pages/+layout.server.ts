import type { LayoutServerLoad } from './$types'
import { listUserComponentHeaders } from '$lib/script/components/componentHeader/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'

export const load: LayoutServerLoad = async ({ locals }) => {
  const componentSchemas = await listUserComponentHeaders(requireAuthContext(locals))

  return {
    componentSchemas
  }
}
