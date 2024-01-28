import { createDirectory, deleteObject, listDirectory } from '$lib/script/storage'

export const load = async ({ params }) => {
  const {
    bucketId,
    path
  } = params

  const contents = await listDirectory({
    bucket: bucketId,
    name: path
  })

  return {
    path,
    contents
  }
}

export const actions = {
  createDirectory: async ({
    params,
    request
  }) => {
    const {
      bucketId,
      path
    } = params

    const data = await request.formData()
    const directoryName = data.get('directoryName')
    const directoryPath = `${path}/${directoryName}`

    await createDirectory({
      bucket: bucketId,
      name: directoryPath
    })
  },
  deleteFile: async ({
    params,
    request
  }) => {
    const {
      bucketId,
      path
    } = params
    const data = await request.formData()
    const fileName = data.get('fileName')
    console.log(bucketId, path, fileName)
    // await deleteObject({
    //   bucket: bucketId,
    //   name: `${path}/${fileName}`
    // })
  }
}
