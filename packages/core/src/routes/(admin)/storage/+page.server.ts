import { getBucketReferences } from '$lib/script/storage/storage.server'

export const load = () => {
  const buckets = getBucketReferences()
  return {
    buckets
  }
}
