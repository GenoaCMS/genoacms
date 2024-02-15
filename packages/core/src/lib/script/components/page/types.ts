import type { ComponentSchema } from '$lib/script/components/componentSchema/types'

interface ComponentNode {
  schema: ComponentSchema,
  code?: string,
  data: Record<ComponentSchema['attributes'][number]['name'], unknown>
}

interface SerializedComponentNode extends Omit<ComponentNode, 'schema'> {
  schema: string
}

interface Page {
  name: string,
  previewURL: string,
  contents: ComponentNode,
  lastModified: string
}

interface SerializedPage extends Omit<Page, 'contents'> {
  contents: string
}

export type {
  ComponentNode,
  SerializedComponentNode,
  Page,
  SerializedPage
}
