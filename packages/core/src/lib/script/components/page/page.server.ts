import type { SerializedPage } from '$lib/script/components/types'
import {
  defaultBucketId,
  fullyQualifiedNameToFilename,
  getObjectJSON,
  listOrCreateDirectory,
  uploadObject
} from '$lib/script/storage.server'
import { join } from 'path'

const pagesPath = join('.genoacms', 'pages/')

const listOrCreatePageList = async () => {
  const pageStructureList = await listOrCreateDirectory({
    bucket: defaultBucketId,
    name: pagesPath
  })
  // const pageStructurePromises = pageStructureList.files
  //   .map(async page => getPageStructure(page.name))
  // const pageStructures = await Promise.all(pageStructurePromises)
  // return pageStructures.filter(schema => schema !== null)
  return pageStructureList.files.map(page => fullyQualifiedNameToFilename(page.name))
}

const createPage = (values: { name: string, contents: string }): SerializedPage => {
  return {
    previewURL: '',
    lastModified: new Date().toISOString(),
    ...values
  }
}

const uploadPage = (page: SerializedPage) => {
  const pageJson = JSON.stringify(page)
  // TODO: validate page
  return uploadObject({
    bucket: defaultBucketId,
    name: join(pagesPath, page.name)
  }, pageJson)
}

const getPage = (name: string) => {
  return getObjectJSON({
    bucket: defaultBucketId,
    name: join(pagesPath, name)
  })
}

export {
  listOrCreatePageList,
  createPage,
  uploadPage,
  getPage
}
