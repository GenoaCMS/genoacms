type ReadableAttributeValue = boolean | number | string | Array<ReadablePageNode>

type ReadablePageNode<isComponentPrebuilt extends boolean> = {
  componentName: isComponentPrebuilt extends true ? string : undefined,
  componentCode: isComponentPrebuilt extends false ? string : undefined,
  data: Record<string, ReadableAttributeValue>
}
export type {
  ReadableAttributeValue,
  ReadablePageNode
}
