import type { ComponentSchema, ComponentSchemaFile } from '$lib/script/components/componentSchema/types'

type ComponentNodeData = Record<ComponentSchema['attributes'][number]['name'], unknown>

interface ComponentNode {
  schemaFile: ComponentSchemaFile,
  code?: string,
  data: ComponentNodeData
}

interface SerializedComponentNode extends Omit<ComponentNode, 'schemaFile' | 'data'> {
  schemaName: string,
  data: string
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
  ComponentNodeData,
  ComponentNode,
  SerializedComponentNode,
  Page,
  SerializedPage
}
