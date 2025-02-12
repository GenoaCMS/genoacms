import type { Diff } from 'deep-diff'
import type { ComponentEntryReference } from '../componentEntry/component/types'

type ComponentDefinitionReference = string
type ComponentCode = string
type ComponentLanguage = 'javascript'
type CodeChange = Array<Diff<ComponentCode>>

interface ComponentCreation {
  name: string,
}

interface ComponentDefinition {
  uid: ComponentDefinitionReference,
  language: ComponentLanguage,
  uncommitedCode: ComponentCode,
  code: ComponentCode,
  history: Array<CodeChange>,
  future: Array<CodeChange>
}

interface Component extends ComponentCreation {
  entryId: ComponentEntryReference,
  definitionId: ComponentDefinitionReference,
}

export type {
  ComponentCreation,
  ComponentDefinitionReference,
  ComponentCode,
  ComponentLanguage,
  CodeChange,
  ComponentDefinition,
  Component
}

