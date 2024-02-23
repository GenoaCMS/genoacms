import type { JSONSchemaType } from 'ajv'
import type { attributeValue, ComponentSchema, ComponentSchemaFile } from '$lib/script/components/componentSchema/types'
import { attributeToSchema } from '$lib/script/components/componentSchema/schemas.server'
import { getComponentSchemaFile } from '$lib/script/components/componentSchema/component.server'

type PrimitiveAttributeValue = boolean | number | string
interface LinkAttributeValue<T extends boolean = boolean> {
  isExternal: T,
  url: T extends true ? string : undefined,
  pageName: T extends false ? string : undefined
}

type componentNodeReference = string
type attributeReference = string

// eslint-disable-next-line no-use-before-define
type AttributeValue = PrimitiveAttributeValue | LinkAttributeValue | Array<componentNodeReference>

interface AttributeData<T extends AttributeValue = AttributeValue> {
  uid: attributeReference,
  name: string,
  type: string,
  schema: JSONSchemaType<T>,
  value: T
}

type ComponentNodeData = Record<attributeReference, AttributeData>
interface ComponentNode {
  uid: componentNodeReference,
  schemaName: string,
  data: ComponentNodeData
}
interface PageContents {
  nodes: Record<componentNodeReference, ComponentNode>
  rootNodeUid: componentNodeReference
}

interface PageEntry {
  name: string,
  previewURL: string,
  contents: PageContents,
  lastModified: string
}

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
    case 'component':
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
  const data: Record<attributeReference, AttributeData> = {}
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

export type {
  componentNodeReference,
  AttributeData,
  ComponentNode,
  PageEntry
}
export {
  componentSchemaToNode,
  createPageEntry,
  updateComponentNode,
  addNodeToPage
}
