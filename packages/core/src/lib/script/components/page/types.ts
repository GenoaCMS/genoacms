import type { ComponentSchema } from '$lib/script/components/componentSchema/types'
import type { JSONSchemaType } from 'ajv'

type PrimitiveAttributeValue = boolean | number | string
// eslint-disable-next-line no-use-before-define
type AttributeValue = PrimitiveAttributeValue | Array<ComponentNode>
// eslint-disable-next-line no-use-before-define
type SerializedAttributeValue = PrimitiveAttributeValue | Array<SerializedComponentNode>

interface AttributeData {
  name: string,
  schema: JSONSchemaType<AttributeValue>,
  value: AttributeValue
}
interface SerializedAttributeData extends Omit<AttributeData, 'schema' | 'value'> {
  value: SerializedAttributeValue
}

type ComponentNodeData = Array<AttributeData>
type SerializedComponentNodeData = Array<SerializedAttributeData>

interface ComponentNode {
  schemaName: string,
  data: ComponentNodeData
}

interface SerializedComponentNode extends Omit<ComponentNode, 'data'> {
  data: SerializedComponentNodeData
}

interface Page {
  name: string,
  previewURL: string,
  contents: ComponentNode,
  lastModified: string
}

interface SerializedPage extends Omit<Page, 'contents'> {
  contents: SerializedComponentNode
}

export type {
  PrimitiveAttributeValue,
  AttributeValue,
  SerializedAttributeValue,
  AttributeData,
  SerializedAttributeData,
  ComponentNodeData,
  SerializedComponentNodeData,
  ComponentNode,
  SerializedComponentNode,
  Page,
  SerializedPage
}
