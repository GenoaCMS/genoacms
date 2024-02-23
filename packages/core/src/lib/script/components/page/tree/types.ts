type ReadableAttributeValue = boolean | number | string | Array<ReadablePageNode>

type ReadablePageNode = {
  component: string,
  data: Record<string, ReadableAttributeValue>
}
export type {
  ReadableAttributeValue,
  ReadablePageNode
}
