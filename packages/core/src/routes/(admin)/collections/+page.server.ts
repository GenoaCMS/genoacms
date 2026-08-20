import { getUserCollectionReferences } from '$lib/script/database/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'

export async function load ({ locals }) {
  // Filtered to what this principal may read, so navigation offers nothing that would be denied.
  const collectionReferences = getUserCollectionReferences(requireAuthContext(locals))
  return {
    collectionReferences
  }
}
