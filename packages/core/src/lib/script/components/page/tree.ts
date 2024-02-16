import type { ComponentSchema, ComponentSchemaFile } from '$lib/script/components/componentSchema/types'
import type { ComponentNode, ComponentNodeData, SerializedComponentNode } from '$lib/script/components/page/types'
import { getComponentSchemaFile } from '$lib/script/components/componentSchema/component.server'

const generateAttributeDefaultValue = (type: ComponentSchema['attributes'][number]['type']) => {
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
    case 'storageResource':
      return ''
    case 'component':
      return []
    default:
      return null
  }
}

const componentSchemaToNode = (schemaFile: ComponentSchemaFile): ComponentNode => {
  const data: Record<string, unknown> = {}
  const schema = schemaFile.versions[schemaFile.currentVersion]
  for (const attribute of schema.attributes) {
    data[attribute.name] = 'defaultValue' in attribute ? attribute?.defaultValue : generateAttributeDefaultValue(attribute.type)
  }
  return {
    schemaFile,
    data
  }
}

const serializeData = (schema: ComponentSchema, data: ComponentNodeData) => {
  const serializedData: Record<string, unknown> = {}
  for (const attribute of schema.attributes) {
    if (attribute.type === 'component') {
      serializedData[attribute.name] = data[attribute.name].map((component: ComponentNode) => serializeComponentNode(component))
    } else {
      serializedData[attribute.name] = data[attribute.name]
    }
  }
  return JSON.stringify(serializedData)
}

const serializeComponentNode = (node: ComponentNode): string => {
  return JSON.stringify({
    schemaName: node.schemaFile.name,
    data: serializeData(node.schemaFile.versions[node.schemaFile.currentVersion], node.data)
  })
}

const deserializeData = (schema: ComponentSchema, data: ComponentNodeData) => {
  const deserializedData: Record<string, unknown> = {}
  for (const attribute of schema.attributes) {
    if (attribute.type === 'component') {
      deserializedData[attribute.name] = data[attribute.name].map((component: string) => deserializeComponentNode(component))
    } else {
      deserializedData[attribute.name] = data[attribute.name]
    }
  }
  return deserializedData
}

const deserializeComponentNode = async (nodeJSON: string): Promise<ComponentNode> => {
  console.log(nodeJSON)
  const node = JSON.parse(nodeJSON) as SerializedComponentNode
  const schemaFile = await getComponentSchemaFile(node.schemaName)
  if (!schemaFile) throw new Error('no-schema')
  const schema = schemaFile.versions[schemaFile.currentVersion]
  const data = deserializeData(schema, JSON.parse(node.data))
  return {
    schemaFile,
    data
  }
}

export {
  componentSchemaToNode,
  serializeComponentNode,
  deserializeComponentNode
}
