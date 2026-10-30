import type { IsSerializable, PageEntry } from '#lib/script/components/page/entry/types.js'
import {
  defaultBucketId,
  deleteInternalObject,
  fullyQualifiedNameToFilename,
  getInternalObjectFlattedVersioned,
  getInternalObjectStringVersioned,
  listOrCreateDirectory,
  uploadInternalObjectFlatted
} from '#lib/script/storage/storage.server.js'
import { join } from 'path'
import { isPreconditionFailed, type UploadOptions } from '@genoacms/contracts/storage'
import type { ComponentHeader } from '#lib/script/components/componentHeader/component/types.js'
import { getComponentHeader } from '#lib/script/components/componentHeader/io.server.js'
import { writeConditionally } from '#lib/script/components/conflict.js'
import { PageEditError, throwRefusal, type EditResult } from './edits'
import { isPageName } from './names'
import { pageEntryToReadableTree } from '#lib/script/components/page/tree/index.js'
import { readablePageTreePath, uploadReadablePageTree } from '#lib/script/components/page/tree/io.server.js'
import {
  createPageEntry, deserializeComponentNode, deserializePageEntry, recordPageEdit, serializePageEntry,
  type ComponentHeaderReader
} from './entry'
import { readingOnceEach } from '#lib/script/utils.js'

const pageEntriesPath = join('.genoacms', 'pages', 'entries/')
const pageReadablesPath = join('.genoacms', 'pages', 'readables/')

// PGE-11: appended as given, never through a path library.
const entryPathOf = (name: string): string => `${pageEntriesPath}${name}`

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

interface PageSummary {
  name: string
  lastModified: string
  built: boolean
}

const listPageSummaries = async (): Promise<PageSummary[]> => {
  const [entries, readables] = await Promise.all([
    listOrCreateDirectory({ bucket: defaultBucketId, name: pageEntriesPath }),
    listOrCreateDirectory({ bucket: defaultBucketId, name: pageReadablesPath })
  ])
  const built = new Set(readables.files.map(file => fullyQualifiedNameToFilename(file.name)))
  return entries.files.map(file => {
    const name = fullyQualifiedNameToFilename(file.name)
    return { name, lastModified: new Date(file.lastModified ?? 0).toISOString(), built: built.has(name) }
  })
}

const uploadPageEntry = async (page: PageEntry<IsSerializable>, options?: UploadOptions): Promise<void> => {
  page.lastModified = new Date().toISOString()
  await uploadInternalObjectFlatted(entryPathOf(page.name), serializePageEntry(page as never), options)
}

const sharedHeaderReader = (): ComponentHeaderReader => readingOnceEach(getComponentHeader)

const readStoredPageEntry = async (name: string): Promise<{ stored: PageEntry<IsSerializable>, version?: string }> => {
  const { data, version } = await getInternalObjectFlattedVersioned(entryPathOf(name))
  return { stored: data as PageEntry<IsSerializable>, version }
}

// TODO: refactor/rethink
const readPageEntry = async (
  name: string,
  readHeader: ComponentHeaderReader = sharedHeaderReader()
): Promise<{ page: PageEntry<IsSerializable>, version?: string }> => {
  const { stored: serializedPageEntry, version } = await readStoredPageEntry(name)
  const deserializedNodePromises = []
  for (const key in serializedPageEntry.contents.nodes) {
    const node = serializedPageEntry.contents.nodes[key]
    deserializedNodePromises.push(deserializeComponentNode(node, readHeader))
  }
  const deserializedNodes = await Promise.all(deserializedNodePromises)
  for (const item of deserializedNodes) {
    serializedPageEntry.contents.nodes[item.uid] = item
  }
  return { page: serializedPageEntry, version }
}

const getPageEntry = async (name: string): Promise<PageEntry<IsSerializable>> => (await readPageEntry(name)).page

/** HIS-2: the entry with the version a later save must carry. */
const getPageEntryVersioned = readPageEntry

/** PGE-3: the entry as the page editor opens it, with the version a later save must carry (HIS-2). */
const openPageEntry = async (name: string): Promise<{ page: PageEntry, version?: string }> => {
  const { stored, version } = await readStoredPageEntry(name)
  return { page: await deserializePageEntry(stored), version }
}

const currentVersion = async (name: string): Promise<string | undefined> =>
  (await getInternalObjectStringVersioned(entryPathOf(name))).version

/** HIS-2: writes the entry on condition that it still has `version`, and returns the version it now has. */
const savePageEntry = async (page: PageEntry<IsSerializable>, version: string | undefined): Promise<string | undefined> => {
  await writeConditionally(async options => { await uploadPageEntry(page, options) }, `page ${page.name}`, version)
  return await currentVersion(page.name)
}

const headersOfContents = async (
  contents: PageEntry<IsSerializable>['contents'],
  extra: string[],
  readHeader: ComponentHeaderReader
): Promise<Map<string, ComponentHeader>> => {
  const uids = new Set([...Object.values(contents.nodes).map(node => node.entryReference), ...extra])
  const headers = await Promise.all([...uids].map(readHeader))
  return new Map(headers.filter((header): header is ComponentHeader => header !== null).map(header => [header.uid, header]))
}

interface AppliedEdit<R> {
  version: string | undefined
  result: R
  page: PageEntry<IsSerializable>
}

/**
 * PGE-4, PGE-5, TOL-16: applies a pure edit to a page read at `version`, records one step, and writes
 * conditionally. `authorize` runs on the outcome before anything is written.
 */
const applyPageEdit = async <R extends EditResult>(
  name: string,
  version: string | undefined,
  extraHeaders: string[],
  edit: (contents: PageEntry<IsSerializable>['contents'], headers: Map<string, ComponentHeader>) => R,
  authorize: (result: R) => void = () => {}
): Promise<AppliedEdit<R>> => {
  const readHeader = sharedHeaderReader()
  const { page } = await readPageEntry(name, readHeader)
  const result = edit(page.contents, await headersOfContents(page.contents, extraHeaders, readHeader))
  if (!result.ok) throwRefusal(result)
  authorize(result)
  const saved = recordPageEdit(page, result.contents)
  return { version: await savePageEntry(saved, version), result, page: saved }
}

/** PGE-2, PGE-11: creates the entry of a new page, only if no entry of that name exists. */
const createPageIfAbsent = async (name: string, componentUID: string): Promise<string | undefined> => {
  if (!isPageName(name)) throw new PageEditError('pages/invalid-name', `pages/invalid-name: ${name}`)
  const entry = await createPageEntry({ name, componentUID })
  try {
    await uploadPageEntry(entry, { ifAbsent: true })
  } catch (error) {
    if (isPreconditionFailed(error)) throw new PageEditError('pages/exists', `pages/exists: ${name}`)
    throw error
  }
  return await currentVersion(name)
}

/**
 * Builds a page's readable tree and publishes it, signed.
 *
 * Building pins each dynamic node to the revision current at this moment, and the signature covers
 * those pins — so a published page names both which components it has and which revision of each,
 * and neither can be changed by writing to the bucket.
 */
const generateReadablePageTree = async (page: PageEntry<IsSerializable>) => {
  const readableTree = await pageEntryToReadableTree(page)
  await uploadReadablePageTree(page.name, readableTree)
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
  await deleteInternalObject(entryPathOf(name))

  try {
    await deleteInternalObject(readablePageTreePath(name))
  } catch (error) {
    console.warn(
      `[genoacms:pages] deleted the entry for ${name} but not its readable tree: ` +
      `${(error as Error).message}. If the page was ever built, the built copy is still being served.`
    )
  }
}

export type { PageSummary, AppliedEdit }

export {
  listOrCreatePageList,
  listPageSummaries,
  uploadPageEntry,
  getPageEntry,
  getPageEntryVersioned,
  openPageEntry,
  savePageEntry,
  applyPageEdit,
  createPageIfAbsent,
  generateReadablePageTree,
  deletePageEntry
}
