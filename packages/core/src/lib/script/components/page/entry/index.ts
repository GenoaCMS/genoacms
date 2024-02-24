import type { attributeValue, ComponentSchema, ComponentSchemaFile } from '$lib/script/components/componentSchema/types'
import { attributeToSchema } from '$lib/script/components/componentSchema/schemas.server'
import { getComponentSchemaFile } from '$lib/script/components/componentSchema/component.server'
import type { AttributeData, AttributeReference, AttributeValue, ComponentNode, PageContents, PageEntry } from './types'
import diff from 'deep-diff'

const generateAttributeDefaultValue = (type: ComponentSchema['attributes'][number]['type']): AttributeValue => {
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

const generateAttributeData = async (attribute: attributeValue): Promise<AttributeData> => {
  return {
    uid: crypto.randomUUID(),
    name: attribute.name,
    type: attribute.type,
    schema: await attributeToSchema(attribute),
    value: 'defaultValue' in attribute ? attribute?.defaultValue : generateAttributeDefaultValue(attribute.type)
  }
}

const componentSchemaToNode = async (schemaFile: ComponentSchemaFile): Promise<ComponentNode> => {
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

const createPageEntry = async (values: { name: string, componentName: string }): Promise<PageEntry> => {
  const component = await getComponentSchemaFile(values.componentName)
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

const removeNodesFromHistory = (page: PageEntry) => {
  for (const nodeUID in page.contents.nodes) {
    if (!page.contents.nodes[nodeUID]) delete page.contents.nodes[nodeUID]
  }
  return page
}

const pushPageEntryState = (oldContents: PageContents, page: PageEntry) => {
  const differences = diff.diff(oldContents, page.contents)
  if (differences) {
    page.history.push(...differences)
    page.future = []
  }
  return page
}

const undoPageEntryState = (page: PageEntry) => {
  const lastDiff = page.history.pop()
  if (lastDiff) {
    diff.revertChange(page.contents, page.contents, lastDiff)
    page.future.push(lastDiff)
    page = removeNodesFromHistory(page)
  }
  return page
}

const redoPageEntryState = (page: PageEntry) => {
  const nextDiff = page.future.pop()
  if (nextDiff) {
    diff.applyChange(page.contents, page.contents, nextDiff)
    page.history.push(nextDiff)
    page = removeNodesFromHistory(page)
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

const addChildNodeToNodeInPage = (page: PageEntry, node: ComponentNode, attributeUID: AttributeReference, childNode: ComponentNode) => {
  const oldContents: PageContents = duplicateObject(page.contents)
  page.contents.nodes[childNode.uid] = childNode
  node.data[attributeUID].value.push(childNode.uid)
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
