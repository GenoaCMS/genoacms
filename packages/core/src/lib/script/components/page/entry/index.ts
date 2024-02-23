import type { attributeValue, ComponentSchema, ComponentSchemaFile } from '$lib/script/components/componentSchema/types'
import { attributeToSchema } from '$lib/script/components/componentSchema/schemas.server'
import { getComponentSchemaFile } from '$lib/script/components/componentSchema/component.server'
import type { AttributeData, AttributeReference, AttributeValue, ComponentNode, PageEntry } from './types'

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
      return ''
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
    lastModified: new Date().toISOString()
  }
}

const updateComponentNode = (page: PageEntry, updaterComponent: ComponentNode) => {
  const node = page.contents.nodes[updaterComponent.uid]
  if (!node) throw new Error('no-node')
  page.contents.nodes[updaterComponent.uid] = updaterComponent
  return page
}

const addNodeToPage = (page: PageEntry, node: ComponentNode) => {
  page.contents.nodes[node.uid] = node
  return page
}

export {
  componentSchemaToNode,
  createPageEntry,
  updateComponentNode,
  addNodeToPage
}
