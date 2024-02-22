import type { JSONSchemaType } from 'ajv'

type PrimitiveAttributeValue = boolean | number | string
interface LinkAttributeValue<T extends boolean = boolean> {
  isExternal: T,
  url: T extends true ? string : undefined,
  pageName: T extends false ? string : undefined
}
// eslint-disable-next-line no-use-before-define
type AttributeValue = PrimitiveAttributeValue | LinkAttributeValue | Array<ComponentNode>
// eslint-disable-next-line no-use-before-define
type SerializedAttributeValue = PrimitiveAttributeValue | LinkAttributeValue | Array<SerializedComponentNode>

interface AttributeData<T extends AttributeValue = AttributeValue> {
  name: string,
  type: string,
  schema: JSONSchemaType<T>,
  value: T
}
interface SerializedAttributeData extends Omit<AttributeData, 'type' | 'schema' | 'value'> {
  value: SerializedAttributeValue
}

type ComponentNodeData = Array<AttributeData>
type SerializedComponentNodeData = Array<SerializedAttributeData>

interface ComponentNode {
  uid: string,
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
  LinkAttributeValue,
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
