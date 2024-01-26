import { listDirectory } from '$lib/script/storage'

export const load = async ({ params }) => {
  const { bucketId, path } = params

  const contents = await listDirectory({
    bucket: bucketId,
    name: path
  })

  return {
    path,
    contents
  }
}
