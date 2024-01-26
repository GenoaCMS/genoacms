import { getBucketReferences } from '$lib/script/storage'

export const load = () => {
  const buckets = getBucketReferences()
  return {
    buckets
  }
}
