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
import { JSDOM } from 'jsdom'
import dompurify from 'dompurify'
import { parse } from 'marked'
import { getPublicURL } from '$lib/script/storage/storage.server'
import { getPageEntry } from '$lib/script/components/page/page.server'
import { getComponentHeader } from '$lib/script/components/componentHeader/io.server'
import { getComponentDefiniton } from '$lib/script/components/editor/io'

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
 * The publication a node is pinned to, or nothing if the component is prebuilt.
 *
 * Read at build time and written into the tree, which is what makes the pin a pin: the page names
 * the publication that was current when it was built, and keeps naming it after the component has
 * moved on. Resolving the latest at render time instead would make every published page follow the
 * newest publication, which is the behavior this exists to prevent.
 *
 * A component that has never been published has nothing to pin and nothing to serve. That is left
 * absent rather than reported here: building a page is not the place to discover that one of its
 * components was never published, and the consumer's own verification is what refuses to render it.
 */
const pinnedRevision = async (entryReference: string): Promise<string | undefined> => {
  const entry = await getComponentHeader(entryReference)
  if (entry === null || entry.type !== 'dynamic') return undefined

  const definition = await getComponentDefiniton(entryReference)
  return definition.lastPublicationId
}

/**
 * What a node needs in order for a consumer to fetch what it pins.
 *
 * `uid` and `publicationId` travel together: an executable lives at `{uid}/{publicationId}`, so either alone
 * is a pin nobody can resolve. Both are omitted for a prebuilt component, which has no artifact.
 */
const artifactReference = async (entryReference: string): Promise<{ uid: string, publicationId: string } | undefined> => {
  const publicationId = await pinnedRevision(entryReference)
  if (publicationId === undefined) return undefined
  return { uid: entryReference, publicationId }
}

const componentNodeToReadablePageNode = async (node: ComponentNode,
  componentNodes: ComponentNodes): Promise<ReadablePageNode> => {
  const artifact = await artifactReference(node.entryReference)
  const readableNode: ReadablePageNode = {
    component: node.name,
    // Omitted rather than set to undefined for a prebuilt component: the tree is signed, and
    // canonicalization drops an undefined member silently while refusing to represent it — so an
    // explicit `publicationId: undefined` would sign as though the key had never been written.
    ...(artifact ?? {}),
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
