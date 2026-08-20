import { getUserBucketReferences } from '$lib/script/storage/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'

export const load = ({ locals }) => {
  // Filtered to what this principal may read, so navigation offers nothing that would be denied.
  const buckets = getUserBucketReferences(requireAuthContext(locals))
  return {
    buckets
  }
}
