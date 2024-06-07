import type { IsSerializable, PageEntry } from '$lib/script/components/page/entry/types'
import {
  defaultBucketId,
  fullyQualifiedNameToFilename,
  getObjectFlatted,
  listOrCreateDirectory,
  uploadObject
} from '$lib/script/storage/storage.server'
import { join } from 'path'
import { pageEntryToReadableTree } from '$lib/script/components/page/tree'
import { stringify } from 'flatted'
import { deserializeComponentNode } from './entry'

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

const uploadPageEntry = (page: PageEntry<IsSerializable>) => {
  const pageFlatted = stringify({
    ...page,
    lastModified: new Date().toISOString()
  })
  // TODO: validate page
  return uploadObject({
    bucket: defaultBucketId,
    name: join(pageEntriesPath, page.name)
  }, pageFlatted)
}

// TODO: refactor/rethink
const getPageEntry = async (name: string): Promise<PageEntry<IsSerializable>> => {
  const serializedPageEntry = await getObjectFlatted({
    bucket: defaultBucketId,
    name: join(pageEntriesPath, name)
  }) as PageEntry<IsSerializable>
  const deserializedNodePromises = []
  for (const key in serializedPageEntry.contents.nodes) {
    const node = serializedPageEntry.contents.nodes[key]
    deserializedNodePromises.push(deserializeComponentNode(node))
  }
  const deserializedNodes = await Promise.all(deserializedNodePromises)
  for (const item of deserializedNodes) {
    serializedPageEntry.contents.nodes[item.uid] = item
  }
  return serializedPageEntry
}

const generateReadablePageTree = async (page: PageEntry<IsSerializable>) => {
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
