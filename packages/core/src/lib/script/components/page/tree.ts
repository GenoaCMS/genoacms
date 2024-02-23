import type { attributeValue, ComponentSchema, ComponentSchemaFile } from '$lib/script/components/componentSchema/types'
import type {
  AttributeData, AttributeValue,
  ComponentNode,
  ComponentNodeData, PrimitiveAttributeValue, SerializedAttributeData, SerializedAttributeValue,
  SerializedComponentNode, SerializedComponentNodeData
} from '$lib/script/components/page/types'
import { getComponentSchemaFile } from '$lib/script/components/componentSchema/component.server'
import { attributeToSchema } from '$lib/script/components/componentSchema/schemas.server'

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
  const serializedData: SerializedComponentNodeData = []
  for (const attributeData of data) {
    serializedData.push(serializeAttributeData(attributeData))
  }
  return serializedData
}

const serializeComponentNode = (node: ComponentNode): SerializedComponentNode => {
  return {
    uid: node.uid,
    schemaName: node.schemaName,
    data: serializeData(node.data)
  }
}

const deserializeAttributeValue = async (type: attributeValue['type'], value: SerializedAttributeValue): Promise<AttributeValue> => {
  if (type !== 'component') {
    return value as PrimitiveAttributeValue
  }
  const componentNodePromises: Array<Promise<ComponentNode>> = value.map((component) => deserializeComponentNode(component))
  return await Promise.all(componentNodePromises)
}

const deserializeAttributeData = async (schemaAttribute: attributeValue, value: SerializedAttributeData): Promise<AttributeData> => {
  return {
    name: schemaAttribute.name,
    type: schemaAttribute.type,
    schema: await attributeToSchema(schemaAttribute),
    value: await deserializeAttributeValue(schemaAttribute.type, value.value)
  }
}

const deserializeData = async (schema: ComponentSchema, data: SerializedComponentNodeData) => {
  const attributePromises: Array<Promise<AttributeData>> = []
  for (const attribute of schema.attributes) {
    const attributeData = data.find((data) => data.name === attribute.name)
    if (!attributeData) {
      attributePromises.push(generateAttributeData(attribute))
      continue
    }
    attributePromises.push(deserializeAttributeData(attribute, attributeData))
  }
  const deserializedData: ComponentNodeData = await Promise.all(attributePromises)
  return deserializedData
}

const deserializeComponentNode = async (node: SerializedComponentNode): Promise<ComponentNode> => {
  const schemaFile = await getComponentSchemaFile(node.schemaName)
  if (!schemaFile) throw new Error('no-schema')
  const schema = schemaFile.versions[schemaFile.currentVersion]
  const data = await deserializeData(schema, node.data)
  return {
    uid: node.uid,
    schemaName: schemaFile.name,
    data
  }
}

const getComponentNodeByUidPath = (tree: ComponentNode, uidPath: Array<string>): ComponentNode => {
  let node = tree
  if (uidPath.length === 1 && node.uid === uidPath[0]) return node
  for (const uid of uidPath) {
    const components = node.data
      .filter((data) => data.type === 'component') as Array<AttributeData<Array<ComponentNode>>>
    let foundNode
    for (const component of components) {
      foundNode = component.value.find((component) => component.uid === uid)
    }
    if (!foundNode) throw new Error('node-not-found')
    node = foundNode
  }
  return node
}

export {
  serializeComponentNode,
  deserializeComponentNode,
  getComponentNodeByUidPath
}
