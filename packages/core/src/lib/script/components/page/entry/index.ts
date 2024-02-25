import type {
  Attribute,
  AttributeType,
  ComponentsAttributeType,
  PrebuiltComponentEntry, PrebuiltComponentReference
} from '$lib/script/components/componentEntry/component/types'
import { attributeToSchema } from '$lib/script/components/componentEntry/attribute/index.server'
import { getPrebuiltComponentEntry } from '$lib/script/components/componentEntry/component.server'
import type { AttributeData, AttributeReference, ComponentNode, PageContents, PageEntry } from './types'
import diff from 'deep-diff'
import type { AttributeValue } from '$lib/script/components/componentEntry/attribute/types'

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
    uid: crypto.randomUUID(),
    name: attribute.name,
    type: attribute.type,
    schema: await attributeToSchema(attribute),
    value: 'defaultValue' in attribute ? attribute?.defaultValue : generateAttributeDefaultValue(attribute.type)
  }
}

const componentSchemaToNode = async (schemaFile: PrebuiltComponentEntry): Promise<ComponentNode> => {
  const dataPromises: Array<Promise<AttributeData>> = []
  const data: Record<AttributeReference, AttributeData> = {}
  const schema = schemaFile.versions[schemaFile.currentVersion]
  for (const attribute of schema.attributes) {
    dataPromises.push(generateAttributeData(attribute))
  }
  for (const attributeData of await Promise.all(dataPromises)) {
    data[attributeData.uid] = attributeData
  }
  return {
    uid: crypto.randomUUID(),
    schemaName: schemaFile.name,
    data
  }
}

const createPageEntry = async (values: { name: string, componentUID: PrebuiltComponentReference }): Promise<PageEntry> => {
  const component = await getPrebuiltComponentEntry(values.componentUID)
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

const pushPageEntryState = (oldContents: PageContents, page: PageEntry) => {
  const differences = diff.diff(oldContents, page.contents)
  if (differences) {
    page.history.push(differences)
    page.future = []
  }
  return page
}

const undoPageEntryState = (page: PageEntry) => {
  const lastChange = page.history.pop()
  if (lastChange) {
    for (const changeDiff of lastChange) {
      diff.revertChange(page.contents, page.contents, changeDiff)
    }
    page.future.push(lastChange)
  }
  return page
}

const redoPageEntryState = (page: PageEntry) => {
  const nextChange = page.future.pop()
  if (nextChange) {
    for (const changeDiff of nextChange) {
      diff.applyChange(page.contents, page.contents, changeDiff)
    }
    page.history.push(nextChange)
  }
  return page
}

const duplicateObject = (object: object) => JSON.parse(JSON.stringify(object))

const updateComponentNode = (page: PageEntry, updaterComponent: ComponentNode) => {
  const node = page.contents.nodes[updaterComponent.uid]
  if (!node) throw new Error('no-node')
  const oldContents: PageContents = duplicateObject(page.contents)
  page.contents.nodes[updaterComponent.uid] = updaterComponent
  page = pushPageEntryState(oldContents, page)
  return page
}

const isAttributeDataComponentsType = (attribute: AttributeData): attribute is AttributeData<ComponentsAttributeType> => attribute.type === 'components'

const addChildNodeToNodeInPage = (page: PageEntry, node: ComponentNode, attributeUID: AttributeReference, childNode: ComponentNode) => {
  const oldContents: PageContents = duplicateObject(page.contents)
  page.contents.nodes[childNode.uid] = childNode
  const attribute = node.data[attributeUID]
  if (!isAttributeDataComponentsType(attribute)) throw new Error('invalid-attribute-type')
  attribute.value.push(childNode.uid)
  page = pushPageEntryState(oldContents, page)
  return page
}

export {
  componentSchemaToNode,
  createPageEntry,
  updateComponentNode,
  addChildNodeToNodeInPage,
  undoPageEntryState,
  redoPageEntryState
}
