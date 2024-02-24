import type {
  AttributeData,
  ComponentNode,
  ComponentNodeReference,
  ComponentNodes,
  PageEntry
} from '$lib/script/components/page/entry/types'
import type { ReadableAttributeValue, ReadablePageNode } from '$lib/script/components/page/tree/types'
import { JSDOM } from 'jsdom'
import dompurify from 'dompurify'
import { parse } from 'marked'
import { getPublicURL } from '$lib/script/storage/storage.server'
import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

const parseMarkdown = async (markdown: string) => {
  const window = new JSDOM('').window
  const purify = dompurify(window)
  const html = await parse(markdown)
  return purify.sanitize(html)
}

const componentNodesToReadableNodes = async (component: Array<ComponentNodeReference>, componentNodes: ComponentNodes) => {
  console.log(component)
  const readableNodePromises: Array<Promise<ReadablePageNode>> = component
    .map(component => componentNodeToReadablePageNode(componentNodes[component], componentNodes))
  return await Promise.all(readableNodePromises)
}

const getStorageResourceURL = async (reference: ObjectReference) => {
  let url: string
  try {
    url = await getPublicURL(reference)
  } catch (e) {
    return ''
  }
  return url
}

const attributeDataToNodeValue = async (data: AttributeData, componentNodes: ComponentNodes): Promise<ReadableAttributeValue> => {
  switch (data.type) {
    case 'boolean':
    case 'number':
    case 'string':
    case 'text':
      return data.value
    case 'markdown':
      return await parseMarkdown(data.value as string)
    case 'richText':
      return ''
    case 'link':
      return data.value.isExternal ? data.value.url : data.value.pageName
    case 'storageResource':
      return getStorageResourceURL(data.value)
    case 'components':
      return await componentNodesToReadableNodes(data.value as Array<ComponentNodeReference>, componentNodes)
  }
}

const componentNodeToReadablePageNode = async (node: ComponentNode, componentNodes: ComponentNodes): Promise<ReadablePageNode> => {
  const readableNode: ReadablePageNode = {
    component: node.schemaName,
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
