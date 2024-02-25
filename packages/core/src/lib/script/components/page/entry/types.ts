import type { JSONSchemaType } from 'ajv'
import type { Diff } from 'deep-diff'
import type { AttributeType } from '$lib/script/components/componentEntry/component/types'
import type { AttributeValue, ComponentNodeReference } from '$lib/script/components/componentEntry/attribute/types'

type AttributeReference = string

interface AttributeData<T extends AttributeType = AttributeType, V extends AttributeValue<T> = AttributeValue<T>> {
  uid: AttributeReference,
  name: string,
  type: T,
  schema: JSONSchemaType<V>,
  value: V
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
  AttributeReference,
  AttributeData,
  ComponentNodeData,
  ComponentNode,
  ComponentNodes,
  PageContents,
  PageEntry
}
