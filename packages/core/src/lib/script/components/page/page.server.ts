import {
  defaultBucketId,
  fullyQualifiedNameToFilename,
  getObjectJSON,
  listOrCreateDirectory,
  uploadObject
} from '$lib/script/storage.server'
import { join } from 'path'
import type { PageEntry } from '$lib/script/components/page/entry/types'
import { pageEntryToReadableTree } from '$lib/script/components/page/tree'

const pageEntriesPath = join('.genoacms', 'pages', 'entries')
const pageReadableTreePath = join('.genoacms', 'pages', 'readables')

const listOrCreatePageList = async () => {
  const pageStructureList = await listOrCreateDirectory({
    bucket: defaultBucketId,
    name: pageEntriesPath
  })
  // const pageStructurePromises = pageStructureList.files
  //   .map(async page => getPageStructure(page.name))
  // const pageStructures = await Promise.all(pageStructurePromises)
  // return pageStructures.filter(schema => schema !== null)
  return pageStructureList.files.map(page => fullyQualifiedNameToFilename(page.name))
}

const uploadPageEntry = (page: PageEntry) => {
  const pageJson = JSON.stringify({
    ...page,
    lastModified: new Date().toISOString()
  })
  // TODO: validate page
  return uploadObject({
    bucket: defaultBucketId,
    name: join(pageEntriesPath, page.name)
  }, pageJson)
}

const getPageEntry = async (name: string): Promise<PageEntry> => {
  return await getObjectJSON({
    bucket: defaultBucketId,
    name: join(pageEntriesPath, name)
  })
}

const generateReadablePageTree = async (page: PageEntry) => {
  const readableTree = await pageEntryToReadableTree(page)
  return uploadObject({
    bucket: defaultBucketId,
    name: join(pageReadableTreePath, page.name)
  }, JSON.stringify(readableTree))
}

export {
  listOrCreatePageList,
  uploadPageEntry,
  getPageEntry,
  generateReadablePageTree
}
