import type { IsSerializable, PageEntry } from '$lib/script/components/page/entry/types'
import {
  defaultBucketId,
  deleteInternalObject,
  fullyQualifiedNameToFilename,
  getInternalObjectFlatted,
  listOrCreateDirectory,
  uploadInternalObjectFlatted,
  uploadInternalObjectJSON
} from '$lib/script/storage/storage.server'
import { join } from 'path'
import { pageEntryToReadableTree } from '$lib/script/components/page/tree'
import { deserializeComponentNode } from './entry'

const pageEntriesPath = join('.genoacms', 'pages', 'entries/')
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
  page.lastModified = new Date().toISOString()
  return uploadInternalObjectFlatted(join(pageEntriesPath, page.name), page)
}

// TODO: refactor/rethink
const getPageEntry = async (name: string): Promise<PageEntry<IsSerializable>> => {
  const serializedPageEntry = await getInternalObjectFlatted(join(pageEntriesPath, name)) as PageEntry<IsSerializable>
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
  console.log('readableTree', readableTree)
  return uploadInternalObjectJSON(join(pageReadableTreePath, page.name), readableTree)
}

/**
 * Removes a page: its entry, and the readable tree built from it.
 *
 * **Both, and the tree second.** The tree is what a visitor is served, so deleting the entry alone
 * would take the page out of the CMS while leaving it published — the one outcome an administrator
 * pressing delete cannot have meant. Doing the tree last means a failure between the two leaves a
 * published page with no entry, which is visible and repairable, rather than an entry with no page.
 *
 * A page that was never built has no tree. That is an ordinary state rather than an error, so a
 * missing tree is tolerated while a failure to delete the entry is not.
 */
const deletePageEntry = async (name: string) => {
  await deleteInternalObject(join(pageEntriesPath, name))

  try {
    await deleteInternalObject(join(pageReadableTreePath, name))
  } catch (error) {
    console.warn(
      `[genoacms:pages] deleted the entry for ${name} but not its readable tree: ` +
      `${(error as Error).message}. If the page was ever built, the built copy is still being served.`
    )
  }
}

export {
  listOrCreatePageList,
  uploadPageEntry,
  getPageEntry,
  generateReadablePageTree,
  deletePageEntry
}
