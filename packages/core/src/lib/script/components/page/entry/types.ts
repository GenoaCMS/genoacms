import type { JSONSchemaType } from 'ajv'
import type { Diff } from 'deep-diff'
import type { attributeType } from '$lib/script/components/componentEntry/types'
import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

type AttributeReference = string
type ComponentNodeReference = string
type PrimitiveAttributeValue = boolean | number | string
interface LinkAttributeValue<T extends boolean = boolean> {
  isExternal: T,
  url: T extends true ? string : undefined,
  pageName: T extends false ? string : undefined
}
type StorageResourceAttributeValue = ObjectReference
type ComponentsAttributeValue = Array<ComponentNodeReference>

// eslint-disable-next-line no-use-before-define
type AttributeValue = PrimitiveAttributeValue | LinkAttributeValue | StorageResourceAttributeValue | ComponentsAttributeValue

interface AttributeData<T extends AttributeValue = AttributeValue> {
  uid: AttributeReference,
  name: string,
  type: attributeType,
  schema: JSONSchemaType<T>,
  value: T
}

type ComponentNodeData = Record<AttributeReference, AttributeData>
interface ComponentNode {
  uid: ComponentNodeReference,
  schemaName: string,
  data: ComponentNodeData
}
type ComponentNodes = Record<ComponentNodeReference, ComponentNode>

interface PageContents {
  nodes: ComponentNodes,
  rootNodeUid: ComponentNodeReference
}

type ContentsChange = Array<Diff<PageContents, PageContents>>

interface PageEntry {
  name: string,
  previewURL: string,
  contents: PageContents,
  history: Array<ContentsChange>,
  future: Array<ContentsChange>,
  lastModified: string
}

export type {
  PrimitiveAttributeValue,
  LinkAttributeValue,
  StorageResourceAttributeValue,
  ComponentsAttributeValue,
  AttributeValue,
  ComponentNodeReference,
  AttributeReference,
  AttributeData,
  ComponentNodeData,
  ComponentNode,
  ComponentNodes,
  PageContents,
  PageEntry
}
