type ReadableAttributeValue = boolean | number | string | Array<ReadablePageNode>

// defaults to boolean so the type can be referenced without committing to
// whether the component is prebuilt, as ReadableAttributeValue does above
type ReadablePageNode<isComponentPrebuilt extends boolean = boolean> = {
  componentName: isComponentPrebuilt extends true ? string : undefined,
  componentCode: isComponentPrebuilt extends false ? string : undefined,
  data: Record<string, ReadableAttributeValue>
}
export type {
  ReadableAttributeValue,
  ReadablePageNode
}
