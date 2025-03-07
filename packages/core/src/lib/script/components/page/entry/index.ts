import type {
  Attribute,
  AttributeType,
  ComponentEntry,
  ComponentsAttributeType,
  ComponentEntryReference
} from '$lib/script/components/componentEntry/component/types'
import { getComponentEntry } from '$lib/script/components/componentEntry/io.server'
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
import diff from 'deep-diff'
import type { AttributeValue } from '$lib/script/components/componentEntry/attribute/types'
import { duplicateObject } from '$lib/script/utils'

const generateAttributeDefaultValue = (type: AttributeType): AttributeValue => {
  switch (type) {
    case 'boolean':
      return false
    case 'number':
      return 0
    case 'string':
    case 'text':
    case 'markdown':
    case 'richText':
    case 'link':
      return {
        isExternal: false,
        url: '',
        pageName: ''
      }
    case 'storageResource':
      return {
        bucket: '',
        name: ''
      }
    case 'components':
      return []
  }
}

const generateAttributeData = async (attribute: Attribute): Promise<AttributeData> => {
  return {
    uid: attribute.uid,
    name: attribute.schema.title,
    type: attribute.type,
    schema: attribute.schema,
    value: 'defaultValue' in attribute ? attribute?.defaultValue : generateAttributeDefaultValue(attribute.type)
  }
}

const componentSchemaToNode = async (entry: ComponentEntry): Promise<ComponentNode> => {
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

const createPageEntry = async (values: {
  name: string,
  componentUID: ComponentEntryReference
}): Promise<PageEntry> => {
  const component = await getComponentEntry(values.componentUID)
  if (!component) throw new Error('no-component')
  const componentNode = await componentSchemaToNode(component)

  return {
    name: values.name,
    previewURL: '',
    contents: {
      nodes: {
        [componentNode.uid]: componentNode
      },
      rootNodeUid: componentNode.uid
    },
    history: [],
    future: [],
    lastModified: new Date().toISOString()
  }
}

const pushPageEntryState = (oldContents: PageContents<IsSerializable>, page: PageEntry<IsSerializable>) => {
  const differences = diff.diff(oldContents, page.contents)
  if (differences) {
    page.history.push(differences)
    page.future = []
  }
  return page
}

const undoPageEntryState = (page: PageEntry<IsSerializable>) => {
  const lastChange = page.history.pop()
  if (lastChange) {
    for (const changeDiff of lastChange) {
      diff.revertChange(page.contents, page.contents, changeDiff)
    }
    page.future.push(lastChange)
  }
  return page
}

const redoPageEntryState = (page: PageEntry<IsSerializable>) => {
  const nextChange = page.future.pop()
  if (nextChange) {
    for (const changeDiff of nextChange) {
      diff.applyChange(page.contents, page.contents, changeDiff)
    }
    page.history.push(nextChange)
  }
  return page
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

const deserializeAttributeData = async (data: AttributeData<AttributeType,
  IsSerializable> | undefined, attribute: Attribute): Promise<AttributeData> => {
  if (!data) {
    return await generateAttributeData(attribute)
  }
  return {
    uid: data.uid,
    name: data.schema.title,
    type: data.type,
    schema: attribute.schema,
    value: data.value
  }
}

const deserializeComponentNodeData = async (nodeData: ComponentNodeData<IsSerializable>,
  componentEntry: ComponentEntry): Promise<ComponentNodeData> => {
  const deserializedDataPromises: Array<Promise<AttributeData>> = []
  const deserializedData: ComponentNodeData = {}
  for (const [uid, attribute] of Object.entries(componentEntry.attributes)) {
    deserializedDataPromises.push(deserializeAttributeData(nodeData[uid], attribute))
  }
  for (const attributeData of await Promise.all(deserializedDataPromises)) {
    deserializedData[attributeData.uid] = attributeData
  }
  return deserializedData
}

const deserializeComponentNode = async (node: ComponentNode<IsSerializable>): Promise<ComponentNode> => {
  const componentEntry = await getComponentEntry(node.entryReference)
  if (!componentEntry) throw new Error('no-component')

  return {
    ...node,
    name: componentEntry.name,
    data: await deserializeComponentNodeData(node.data, componentEntry)
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
  updateComponentNode,
  addChildNodeToNodeInPage,
  undoPageEntryState,
  redoPageEntryState,
  serializeComponentNode,
  serializePageEntry,
  deserializeComponentNode,
  deserializePageEntry
}
