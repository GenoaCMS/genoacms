import { createDirectory, deleteObject, listDirectory, uploadObject } from '$lib/script/storage'

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
  },
  uploadObject: async ({
    params,
    request
  }) => {
    const {
      bucketId,
      path
    } = params
    const data = await request.formData()
    const files = data.getAll('files[]') as Array<File>
    if (files.length === 0) return
    let uploads: Array<Promise<void>> = []
    for (const file of files) {
      const reference = {
        bucket: bucketId,
        name: `${path}/${file.name}`
      }
      uploads = [
        ...uploads,
        uploadObject(reference, file.stream())
      ]
    }
    await Promise.all(uploads)
  }
}
