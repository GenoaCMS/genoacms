import {
  defaultBucketId,
  fullyQualifiedNameToFilename,
  getObjectJSON,
  listOrCreateDirectory,
  uploadObject
} from '$lib/script/storage.server'
import { join } from 'path'
import type { PageEntry } from '$lib/script/components/page/entry/types'

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

const uploadPage = (page: PageEntry) => {
  const pageJson = JSON.stringify({
    ...page,
    lastModified: new Date().toISOString()
  })
  // TODO: validate page
  return uploadObject({
    bucket: defaultBucketId,
    name: join(pagesPath, page.name)
  }, pageJson)
}

const getPage = async (name: string): Promise<PageEntry> => {
  return await getObjectJSON({
    bucket: defaultBucketId,
    name: join(pagesPath, name)
  })
}

export {
  listOrCreatePageList,
  uploadPage,
  getPage
}
