import type { Diff } from 'deep-diff'
import type { ComponentEntryReference } from '../componentEntry/component/types'

type ComponentReference = string
type ComponentCode = string
type ComponentLanguage = 'javascript'
type CodeChange = Array<Diff<ComponentCode>>

interface ComponentCreation {
  name: string,
}

interface ComponentDeletion extends ComponentCreation {
  uid: ComponentEntryReference
}

interface ComponentDefinition {
  uid: ComponentReference,
  language: ComponentLanguage,
  uncommitedCode: ComponentCode,
  code: ComponentCode,
  history: Array<CodeChange>,
  future: Array<CodeChange>
}

interface Component extends ComponentCreation {
  uid: ComponentReference,
}

interface ComponentCodeChange {
  uid: ComponentReference,
  uncommitedCode: string
}

export type {
  ComponentCreation,
  ComponentDeletion,
  ComponentReference,
  ComponentCode,
  ComponentLanguage,
  CodeChange,
  ComponentDefinition,
  Component,
  ComponentCodeChange
}

