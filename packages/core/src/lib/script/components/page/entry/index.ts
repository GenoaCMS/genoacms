import type {
  Attribute,
  AttributeType,
  ComponentHeader,
  ComponentsAttributeType,
  ComponentHeaderReference
} from '$lib/script/components/componentHeader/component/types'
import { getComponentHeader } from '$lib/script/components/componentHeader/io.server'
import { getPublishedComponent } from '$lib/script/components/publication/io.server'
import { defaultValueOf, newNode, PageEditError } from '../edits'
import type {
  AttributeData,
  AttributeReference,
  ComponentNode,
  ComponentNodeData,
  ComponentNodes,
  IsSerializable,
  PageContents,
  PageEntry
} from './types'
import { recordChange, undo, redo } from '$lib/script/undoRedo'
import type { UndoRedoAdjunct } from '$lib/script/undoRedo/types'
import { duplicateObject } from '$lib/script/utils'

const generateAttributeData = async (attribute: Attribute): Promise<AttributeData> => {
  return {
    uid: attribute.uid,
    name: attribute.schema.title,
    type: attribute.type,
    schema: attribute.schema,
    value: defaultValueOf(attribute)
  }
}

const componentSchemaToNode = async (entry: ComponentHeader): Promise<ComponentNode> => {
  const dataPromises: Array<Promise<AttributeData>> = []
  const data: Record<AttributeReference, AttributeData> = {}
  for (const attribute of Object.values(entry.attributes)) {
    dataPromises.push(generateAttributeData(attribute))
  }
  for (const attributeData of await Promise.all(dataPromises)) {
    data[attributeData.uid] = attributeData
  }
  return {
    uid: crypto.randomUUID(),
    name: entry.name,
    entryReference: entry.uid,
    data
  }
}

/** PGE-2: the entry of a new page, whose one root node is of a stored, published component. */
const createPageEntry = async (values: {
  name: string,
  componentUID: ComponentHeaderReference
}): Promise<PageEntry<IsSerializable>> => {
  const component = await getComponentHeader(values.componentUID)
  const published = component === null ? null : await getPublishedComponent(values.componentUID)
  if (component === null || published === null) {
    throw new PageEditError('pages/unpublished-component', `pages/unpublished-component: ${values.componentUID}`)
  }
  const root = newNode(component)

  return {
    name: values.name,
    previewURL: '',
    contents: { nodes: { [root.uid]: root }, rootNodeUid: root.uid },
    history: [],
    future: [],
    lastModified: new Date().toISOString()
  }
}

/**
 * A page's editing history, in the shape the generic operations work on.
 *
 * A `PageEntry` still stores its `history` and `future` inline, alongside fields that are not
 * versioned — its name, its preview URL, when it was last modified. So an adjunct is *presented*
 * from those fields and the result written back, rather than the page being stored as one. Moving
 * pages to a sidecar the way components are stored is a storage migration and is not this change.
 *
 * The write-back is not optional: `future` is cleared by reassignment, so relying on the operations
 * to edit the page in place would silently miss it.
 */
const historyOf = (page: PageEntry<IsSerializable>): UndoRedoAdjunct<PageContents<IsSerializable>> => ({
  history: page.history,
  future: page.future
})

const withHistory = (
  page: PageEntry<IsSerializable>,
  adjunct: UndoRedoAdjunct<PageContents<IsSerializable>>
) => {
  page.history = adjunct.history
  page.future = adjunct.future
  return page
}

const pushPageEntryState = (oldContents: PageContents<IsSerializable>, page: PageEntry<IsSerializable>) =>
  withHistory(page, recordChange(page.contents, historyOf(page), oldContents))

const undoPageEntryState = (page: PageEntry<IsSerializable>) =>
  withHistory(page, undo(page.contents, historyOf(page)))

const redoPageEntryState = (page: PageEntry<IsSerializable>) =>
  withHistory(page, redo(page.contents, historyOf(page)))

/** TOL-16: swaps in edited contents and records the one step from the contents it replaces. */
const recordPageEdit = (page: PageEntry<IsSerializable>, contents: PageContents<IsSerializable>) => {
  const before: PageContents<IsSerializable> = duplicateObject(page.contents)
  page.contents = contents
  return pushPageEntryState(before, page)
}

const updateComponentNode = (page: PageEntry<IsSerializable>, updaterComponent: ComponentNode<IsSerializable>) => {
  const node = page.contents.nodes[updaterComponent.uid]
  if (!node) throw new Error('no-node')
  const oldContents: PageContents<IsSerializable> = duplicateObject(page.contents)
  page.contents.nodes[updaterComponent.uid] = updaterComponent
  page = pushPageEntryState(oldContents, page)
  return page
}

const isAttributeDataComponentsType = (attribute: AttributeData<AttributeType, IsSerializable>):
  attribute is AttributeData<ComponentsAttributeType, IsSerializable> => attribute.type === 'components'

const addChildNodeToNodeInPage = (page: PageEntry<IsSerializable>, node: ComponentNode<IsSerializable>,
  attributeUID: AttributeReference, childNode: ComponentNode<IsSerializable>) => {
  const oldContents: PageContents<IsSerializable> = duplicateObject(page.contents)
  page.contents.nodes[childNode.uid] = childNode
  console.log(node) // TODO: when manipulating node, that had recent change in component entry, change its not reflected in page
  // Reproduction: create page with component A, add attribute to component A, add child to component A's new attribute
  const attribute = node.data[attributeUID]
  if (!isAttributeDataComponentsType(attribute)) throw new Error('invalid-attribute-type')
  attribute.value.push(childNode.uid)
  page = pushPageEntryState(oldContents, page)
  return page
}

const serializeComponentNodeData = (nodeData: ComponentNodeData): ComponentNodeData<IsSerializable> => {
  const serializableData: ComponentNodeData<IsSerializable> = {}
  for (const [uid, data] of Object.entries(nodeData)) {
    serializableData[uid] = {
      uid: data.uid,
      name: data.name,
      type: data.type,
      value: data.value
    }
  }
  return serializableData
}

const serializeComponentNode = (node: ComponentNode): ComponentNode<IsSerializable> => {
  return {
    uid: node.uid,
    entryReference: node.entryReference,
    data: serializeComponentNodeData(node.data)
  }
}

const serializePageContents = (contents: PageContents): PageContents<IsSerializable> => {
  const serializableNodes: ComponentNodes<IsSerializable> = {}
  for (const [uid, node] of Object.entries(contents.nodes)) {
    serializableNodes[uid] = serializeComponentNode(node)
  }
  return {
    nodes: serializableNodes,
    rootNodeUid: contents.rootNodeUid
  }
}
const serializePageEntry = (page: PageEntry): PageEntry<IsSerializable> => {
  return {
    ...page,
    contents: serializePageContents(page.contents)
  }
}

const deserializeAttributeData = async (
  data: AttributeData<AttributeType, IsSerializable> | undefined,
  attribute: Attribute): Promise<AttributeData> => {
  if (!data) {
    return await generateAttributeData(attribute)
  }
  return {
    uid: data.uid,
    name: attribute.schema.title,
    type: data.type,
    schema: attribute.schema,
    value: data.value
  }
}

const deserializeComponentNodeData = async (nodeData: ComponentNodeData<IsSerializable>,
  componentHeader: ComponentHeader): Promise<ComponentNodeData> => {
  const deserializedDataPromises: Array<Promise<AttributeData>> = []
  const deserializedData: ComponentNodeData = {}
  for (const [uid, attribute] of Object.entries(componentHeader.attributes)) {
    deserializedDataPromises.push(deserializeAttributeData(nodeData[uid], attribute))
  }
  for (const attributeData of await Promise.all(deserializedDataPromises)) {
    deserializedData[attributeData.uid] = attributeData
  }
  return deserializedData
}

const deserializeComponentNode = async (node: ComponentNode<IsSerializable>): Promise<ComponentNode> => {
  const componentHeader = await getComponentHeader(node.entryReference)
  if (!componentHeader) throw new Error('no-component')

  return {
    ...node,
    name: componentHeader.name,
    data: await deserializeComponentNodeData(node.data, componentHeader)
  }
}

const deserializePageContents = async (contents: PageContents<IsSerializable>): Promise<PageContents> => {
  const deserializedNodePromises: Array<Promise<ComponentNode>> = []
  const deserializedNodes: ComponentNodes = {}
  for (const node of Object.values(contents.nodes)) {
    deserializedNodePromises.push(deserializeComponentNode(node))
  }
  for (const node of await Promise.all(deserializedNodePromises)) {
    deserializedNodes[node.uid] = node
  }
  return {
    nodes: deserializedNodes,
    rootNodeUid: contents.rootNodeUid
  }
}

const deserializePageEntry = async (page: PageEntry<IsSerializable>): Promise<PageEntry> => {
  return {
    ...page,
    contents: await deserializePageContents(page.contents)
  }
}

export {
  componentSchemaToNode,
  createPageEntry,
  recordPageEdit,
  updateComponentNode,
  addChildNodeToNodeInPage,
  undoPageEntryState,
  redoPageEntryState,
  serializeComponentNode,
  serializePageEntry,
  deserializeComponentNode,
  deserializePageEntry
}
