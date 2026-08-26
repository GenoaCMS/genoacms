import type {
  AttributeData,
  ComponentNode,
  ComponentNodes,
  PageEntry
} from '$lib/script/components/page/entry/types'
import type { ReadableAttributeValue, ReadablePageNode } from '$lib/script/components/page/tree/types'
import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
import type {
  ComponentNodeReference,
  LinkAttributeValue,
  LinksAttributeValue,
  StorageResourcesAttributeValue
} from '$lib/script/components/componentHeader/attribute/types'
import type { ComponentType } from '$lib/script/components/componentHeader/component/types'
import { JSDOM } from 'jsdom'
import dompurify from 'dompurify'
import { parse } from 'marked'
import { getPublicURL } from '$lib/script/storage/storage.server'
import { getPageEntry } from '$lib/script/components/page/page.server'
import { getComponentHeader } from '$lib/script/components/componentHeader/io.server'
import { getPublishedComponent } from '$lib/script/components/publication/io.server'

const parseMarkdown = async (markdown: string) => {
  const window = new JSDOM('').window
  const purify = dompurify(window)
  const html = await parse(markdown)
  return purify.sanitize(html)
}

const linkToURL = async (link: LinkAttributeValue): Promise<string> => {
  if (link.isExternal) {
    return link.url || ''
  }
  if (!link.pageName) return ''
  const destinationPageEntry = await getPageEntry(link.pageName)
  return destinationPageEntry.previewURL
}

/** Both attribute types are lists, so both resolve to a list of URLs, in the author's order. */
const linksToURLs = async (links: LinksAttributeValue): Promise<Array<string>> =>
  await Promise.all(links.map(linkToURL))

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

const componentNodesToReadableNodes = async (component: Array<ComponentNodeReference>, componentNodes: ComponentNodes) => {
  const readableNodePromises: Array<Promise<ReadablePageNode>> = component
    .map(component => componentNodeToReadablePageNode(componentNodes[component], componentNodes))
  const nodes = await Promise.all(readableNodePromises)
  // console.log(JSON.stringify(nodes, null, 2))
  return nodes
}

const attributeDataToNodeValue = async (data: AttributeData, componentNodes: ComponentNodes): Promise<ReadableAttributeValue> => {
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
      return await linksToURLs(data.value as LinksAttributeValue)
    case 'storageResource':
      return await storageResourcesToURLs(data.value as StorageResourcesAttributeValue)
    case 'components':
      return await componentNodesToReadableNodes(data.value as Array<ComponentNodeReference>, componentNodes)
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
  entryReference: string
): Promise<{ type: ComponentType, uid?: string, publicationId?: string }> => {
  const header = await getComponentHeader(entryReference)
  // A node referencing a header that is gone is one nothing can be said about. Read as prebuilt and
  // left unpinned, which is the shape a consumer refuses rather than renders.
  if (header === null) return { type: 'prebuilt' }

  const published = await getPublishedComponent(entryReference)
  if (published === null) return { type: header.type }
  return { type: header.type, uid: entryReference, publicationId: published.publicationId }
}

const componentNodeToReadablePageNode = async (node: ComponentNode,
  componentNodes: ComponentNodes): Promise<ReadablePageNode> => {
  const readableNode: ReadablePageNode = {
    component: node.name,
    // Spread rather than assigned, because the pair is omitted entirely when a component has never
    // been published: the tree is signed, and canonicalization drops an undefined member silently
    // while refusing to represent it — so an explicit `publicationId: undefined` would sign as
    // though the key had never been written.
    ...(await publishedReference(node.entryReference)),
    data: {}
  }
  for (const data of Object.values(node.data)) {
    readableNode.data[data.name] = await attributeDataToNodeValue(data, componentNodes)
  }
  return readableNode
}

const pageEntryToReadableTree = async (page: PageEntry): Promise<ReadablePageNode> => {
  const componentNodes = page.contents.nodes
  const rootNode = componentNodes[page.contents.rootNodeUid]

  return await componentNodeToReadablePageNode(rootNode, componentNodes)
}

export {
  pageEntryToReadableTree
}
