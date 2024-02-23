import type { JSONSchemaType } from 'ajv'

type PrimitiveAttributeValue = boolean | number | string
interface LinkAttributeValue<T extends boolean = boolean> {
  isExternal: T,
  url: T extends true ? string : undefined,
  pageName: T extends false ? string : undefined
}

type ComponentNodeReference = string
type AttributeReference = string

// eslint-disable-next-line no-use-before-define
type AttributeValue = PrimitiveAttributeValue | LinkAttributeValue | Array<ComponentNodeReference>

interface AttributeData<T extends AttributeValue = AttributeValue> {
  uid: AttributeReference,
  name: string,
  type: string,
  schema: JSONSchemaType<T>,
  value: T
}

type ComponentNodeData = Record<AttributeReference, AttributeData>
interface ComponentNode {
  uid: ComponentNodeReference,
  schemaName: string,
  data: ComponentNodeData
}
interface PageContents {
  nodes: Record<ComponentNodeReference, ComponentNode>
  rootNodeUid: ComponentNodeReference
}

interface PageEntry {
  name: string,
  previewURL: string,
  contents: PageContents,
  lastModified: string
}

export type {
  PrimitiveAttributeValue,
  LinkAttributeValue,
  AttributeValue,
  ComponentNodeReference,
  AttributeReference,
  AttributeData,
  ComponentNodeData,
  ComponentNode,
  PageContents,
  PageEntry
}
