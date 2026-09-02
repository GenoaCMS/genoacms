import type { SchemaObject } from '$lib/script/schema'
import type { Diff } from 'deep-diff'
import type { AttributeReference, AttributeType, ComponentHeaderReference } from '$lib/script/components/componentHeader/component/types'
import type { AttributeValue, ComponentNodeReference } from '$lib/script/components/componentHeader/attribute/types'

type IsSerializable = true

interface AttributeData<T extends AttributeType = AttributeType,
  isSerializable extends boolean = false,
  V extends AttributeValue<T> = AttributeValue<T>> {
  uid: AttributeReference,
  name: string,
  type: T,
  schema: isSerializable extends true ? undefined : SchemaObject,
  value: V
}

type ComponentNodeData<isSerializable extends boolean = false> =
  Record<AttributeReference, AttributeData<AttributeType, isSerializable>>
interface NonSerializedComponentNode {
  uid: ComponentNodeReference,
  /**
   * Which component this node is.
   *
   * Still named `entryReference` while its type is `ComponentHeaderReference`, and deliberately so:
   * this key is **written into stored page contents**, so renaming it is a migration of every saved
   * page rather than part of a rename. It moves when the storage it lives in does.
   */
  entryReference: ComponentHeaderReference,
  name: string,
  data: ComponentNodeData
}
interface SerializedComponentNode {
  uid: ComponentNodeReference,
  entryReference: ComponentHeaderReference,
  data: ComponentNodeData<IsSerializable>
}
type ComponentNode<isSerializable extends boolean = false> = isSerializable extends true ? SerializedComponentNode : NonSerializedComponentNode
type ComponentNodes<isSerializable extends boolean = false> = Record<ComponentNodeReference, ComponentNode<isSerializable>>

interface PageContents<isSerializable extends boolean = false> {
  nodes: Record<ComponentNodeReference, ComponentNode<isSerializable>>,
  rootNodeUid: ComponentNodeReference
}

type ContentsChange = Array<Diff<PageContents<IsSerializable>>>

interface PageEntry<isSerializable extends boolean = false> {
  name: string,
  previewURL: string,
  contents: PageContents<isSerializable>,
  history: Array<ContentsChange>,
  future: Array<ContentsChange>,
  lastModified: string
}

export type {
  IsSerializable,
  AttributeReference,
  AttributeData,
  ComponentNodeData,
  ComponentNode,
  ComponentNodes,
  PageContents,
  PageEntry
}
