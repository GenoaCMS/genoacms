import type {
  AttributeData,
  ComponentNode,
  ComponentNodes,
  PageEntry
} from '#lib/script/components/page/entry/types.js'
import type { ReadableAttributeValue, ReadablePageNode } from '#lib/script/components/page/tree/types.js'
import type { ObjectReference } from '@genoacms/contracts/storage'
import type {
  ComponentNodeReference,
  LinkAttributeValue,
  LinksAttributeValue,
  StorageResourcesAttributeValue
} from '#lib/script/components/componentHeader/attribute/types.js'
import type { ComponentType } from '#lib/script/components/componentHeader/component/types.js'
import { JSDOM } from 'jsdom'
import dompurify from 'dompurify'
import { parse } from 'marked'
import { getPublicURL } from '#lib/script/storage/storage.server.js'
import { getPageEntry } from '#lib/script/components/page/page.server.js'
import { getComponentHeader } from '#lib/script/components/componentHeader/io.server.js'
import { getPublishedComponent } from '#lib/script/components/publication/io.server.js'
import { readingOnceEach } from '#lib/script/utils.js'

/** The reads one build makes, each made at most once per key. */
interface BuildReads {
  header: typeof getComponentHeader
  publication: typeof getPublishedComponent
  page: typeof getPageEntry
}

const readsOfOneBuild = (): BuildReads => ({
  header: readingOnceEach(getComponentHeader),
  publication: readingOnceEach(getPublishedComponent),
  page: readingOnceEach(getPageEntry)
})

let purifier: ReturnType<typeof dompurify> | undefined
const sharedPurifier = () => {
  purifier ??= dompurify(new JSDOM('').window)
  return purifier
}

const parseMarkdown = async (markdown: string) => {
  const html = await parse(markdown)
  return sharedPurifier().sanitize(html)
}

const linkToURL = async (link: LinkAttributeValue, reads: BuildReads): Promise<string> => {
  if (link.isExternal) {
    return link.url || ''
  }
  if (!link.pageName) return ''
  const destinationPageEntry = await reads.page(link.pageName)
  return destinationPageEntry.previewURL
}

/** Both attribute types are lists, so both resolve to a list of URLs, in the author's order. */
const linksToURLs = async (links: LinksAttributeValue, reads: BuildReads): Promise<Array<string>> =>
  await Promise.all(links.map(async link => await linkToURL(link, reads)))

const getStorageResourceURL = async (reference: ObjectReference) => {
  let url: string
  try {
    url = await getPublicURL(reference)
  } catch {
    return ''
  }
  return url
}

const storageResourcesToURLs = async (
  resources: StorageResourcesAttributeValue
): Promise<Array<string>> => await Promise.all(resources.map(getStorageResourceURL))

const componentNodesToReadableNodes = async (
  component: Array<ComponentNodeReference>,
  componentNodes: ComponentNodes,
  reads: BuildReads
) => {
  const readableNodePromises: Array<Promise<ReadablePageNode>> = component
    .map(component => componentNodeToReadablePageNode(componentNodes[component], componentNodes, reads))
  const nodes = await Promise.all(readableNodePromises)
  // console.log(JSON.stringify(nodes, null, 2))
  return nodes
}

const attributeDataToNodeValue = async (
  data: AttributeData,
  componentNodes: ComponentNodes,
  reads: BuildReads
): Promise<ReadableAttributeValue> => {
  switch (data.type) {
    case 'boolean':
    case 'number':
    case 'string':
    case 'text':
      return data.value as string
    case 'markdown':
      return await parseMarkdown(data.value as string)
    case 'richText':
      return ''
    case 'link':
      return await linksToURLs(data.value as LinksAttributeValue, reads)
    case 'storageResource':
      return await storageResourcesToURLs(data.value as StorageResourcesAttributeValue)
    case 'components':
      return await componentNodesToReadableNodes(data.value as Array<ComponentNodeReference>, componentNodes, reads)
  }
}

/**
 * What a node says about the component it references: its kind, and the publication it pins.
 *
 * The pin is read at build time and written into the tree, which is what makes it a pin: the page
 * names the publication that was current when it was built, and keeps naming it after the component
 * has moved on. Resolving the latest at render time instead would make every published page follow
 * the newest publication, which is the behavior this exists to prevent.
 *
 * **Both kinds are pinned.** A prebuilt component publishes a signed header describing what it
 * accepts, so it has a publication like any other; only its *code* is the consuming application's.
 * The pin used to be read from the dynamic component's definition, which could not answer for a
 * prebuilt one at all — the pointer record can, and holds the same value for both.
 *
 * A component that has never been published has nothing to pin and nothing to serve. Its pin is left
 * absent rather than reported here: building a page is not the place to discover that one of its
 * components was never published, and the consumer's own verification is what refuses to render it.
 *
 * `uid` and `publicationId` travel together: a publication lives at `{uid}/{publicationId}`, so
 * either alone is a pin nobody can resolve.
 */
const publishedReference = async (
  entryReference: string,
  reads: BuildReads
): Promise<{ type: ComponentType, uid?: string, publicationId?: string }> => {
  const header = await reads.header(entryReference)
  // A node referencing a header that is gone is one nothing can be said about. Read as prebuilt and
  // left unpinned, which is the shape a consumer refuses rather than renders.
  if (header === null) return { type: 'prebuilt' }

  const published = await reads.publication(entryReference)
  if (published === null) return { type: header.type }
  return { type: header.type, uid: entryReference, publicationId: published.publicationId }
}

const componentNodeToReadablePageNode = async (node: ComponentNode,
  componentNodes: ComponentNodes, reads: BuildReads): Promise<ReadablePageNode> => {
  const attributes = Object.values(node.data)
  const [reference, values] = await Promise.all([
    publishedReference(node.entryReference, reads),
    Promise.all(attributes.map(async data => await attributeDataToNodeValue(data, componentNodes, reads)))
  ])
  const readableNode: ReadablePageNode = {
    component: node.name,
    // Spread rather than assigned, because the pair is omitted entirely when a component has never
    // been published: the tree is signed, and canonicalization drops an undefined member silently
    // while refusing to represent it — so an explicit `publicationId: undefined` would sign as
    // though the key had never been written.
    ...reference,
    data: {}
  }
  attributes.forEach((data, index) => {
    readableNode.data[data.name] = values[index]
  })
  return readableNode
}

const pageEntryToReadableTree = async (page: PageEntry): Promise<ReadablePageNode> => {
  const componentNodes = page.contents.nodes
  const rootNode = componentNodes[page.contents.rootNodeUid]

  return await componentNodeToReadablePageNode(rootNode, componentNodes, readsOfOneBuild())
}

export {
  pageEntryToReadableTree
}
