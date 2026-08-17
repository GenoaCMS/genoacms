import {
  listUserComponentEntries
} from '$lib/script/components/componentEntry/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'

export const load = async ({ locals }) => {
  const componentEntries = await listUserComponentEntries(requireAuthContext(locals))
  return {
    componentEntries
  }
}
