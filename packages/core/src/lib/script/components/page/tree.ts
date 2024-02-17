import type { attributeValue, ComponentSchema, ComponentSchemaFile } from '$lib/script/components/componentSchema/types'
import type {
  AttributeData, AttributeValue,
  ComponentNode,
  ComponentNodeData, PrimitiveAttributeValue, SerializedAttributeData, SerializedAttributeValue,
  SerializedComponentNode, SerializedComponentNodeData
} from '$lib/script/components/page/types'
import { getComponentSchemaFile } from '$lib/script/components/componentSchema/component.server'
import { attributeToSchema } from '$lib/script/components/componentSchema/schemas.server'

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
    case 'storageResource':
      return ''
    case 'component':
      return []
  }
}

const componentSchemaToNode = async (schemaFile: ComponentSchemaFile): Promise<ComponentNode> => {
  const data: ComponentNodeData = {}
  const schema = schemaFile.versions[schemaFile.currentVersion]
  for (const attribute of schema.attributes) {
    data[attribute.name] = {
      name: attribute.name,
      schema: await attributeToSchema(attribute),
      value: 'defaultValue' in attribute ? attribute?.defaultValue : generateAttributeDefaultValue(attribute.type)
    } satisfies AttributeData
  }
  return {
    schemaName: schemaFile.name,
    data
  }
}

const serializeAttributeData = (data: AttributeData): SerializedAttributeData => {
  let value: SerializedAttributeValue
  if (data.schema.type === 'component') {
    if (!Array.isArray(data.value)) throw new Error('invalid-component-value')
    value = data.value.map((component: ComponentNode) => serializeComponentNode(component))
  } else {
    value = data.value
  }
  return {
    name: data.name,
    value
  }
}

const serializeData = (data: ComponentNodeData): SerializedComponentNodeData => {
  const serializedData: SerializedComponentNodeData = {}
  for (const attributeName in data) {
    const attributeData = data[attributeName]
    serializedData[attributeName] = serializeAttributeData(attributeData)
  }
  return serializedData
}

const serializeComponentNode = (node: ComponentNode): SerializedComponentNode => {
  return {
    schemaName: node.schemaName,
    data: serializeData(node.data)
  }
}

const serializeComponentTree = (tree: ComponentNode): string => {
  const serializedNode = serializeComponentNode(tree)
  return JSON.stringify(serializedNode)
}

const deserializeAttributeValue = async (type: attributeValue['type'], value: SerializedAttributeValue): Promise<AttributeValue> => {
  if (type !== 'component') {
    return value as PrimitiveAttributeValue
  }
  console.log(value)
  const componentNodePromises: Array<Promise<ComponentNode>> = value.map((component) => deserializeComponentNode(component))
  return await Promise.all(componentNodePromises)
}

const deserializeAttributeData = async (schemaAttribute: attributeValue, value: SerializedAttributeData): Promise<AttributeData> => {
  return {
    name: schemaAttribute.name,
    schema: await attributeToSchema(schemaAttribute),
    value: await deserializeAttributeValue(schemaAttribute.type, value.value)
  }
}

const deserializeData = async (schema: ComponentSchema, data: SerializedComponentNodeData) => {
  const deserializedData: ComponentNodeData = {}
  const attributePromises: Array<Promise<AttributeData>> = []
  for (const attribute of schema.attributes) {
    const attributeData = data[attribute.name]
    attributePromises.push(deserializeAttributeData(attribute, attributeData))
  }
  for (const attribute of await Promise.all(attributePromises)) {
    deserializedData[attribute.name] = attribute
  }
  return deserializedData
}

const deserializeComponentNode = async (node: SerializedComponentNode): Promise<ComponentNode> => {
  const schemaFile = await getComponentSchemaFile(node.schemaName)
  if (!schemaFile) throw new Error('no-schema')
  const schema = schemaFile.versions[schemaFile.currentVersion]
  const data = await deserializeData(schema, node.data)
  return {
    schemaName: schemaFile.name,
    data
  }
}

const deserializeComponentTree = async (nodeJSON: string) => {
  const node = JSON.parse(nodeJSON) as SerializedComponentNode
  return deserializeComponentNode(node)
}

export {
  componentSchemaToNode,
  serializeComponentTree,
  deserializeComponentTree
}
