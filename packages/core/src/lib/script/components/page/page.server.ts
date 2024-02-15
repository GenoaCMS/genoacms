import type { SerializedPage } from '$lib/script/components/types'

const createPage = (values: { name: string, contents: string }): SerializedPage => {
  return {
    previewURL: '',
    lastModified: new Date().toISOString(),
    ...values
  }
}

export {
  createPage
}
