import type { Diff } from 'deep-diff'
import type { ComponentEntryReference } from '../componentEntry/component/types'

type ComponentReference = string
type ComponentCommitReference = string
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
  history: Array<string>,
  future: Array<string>
}

interface Component extends ComponentCreation {
  uid: ComponentReference,
}

interface ComponentCodeChange {
  uid: ComponentReference,
  uncommitedCode: string
}

interface ComponentCommitOrder {
  componentId: ComponentReference,
  message: string
}

interface ComponentCommit extends ComponentCommitOrder {
  uid: ComponentCommitReference,
  timestamp: number,
  change: CodeChange
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
  ComponentCodeChange,
  ComponentCommitOrder,
  ComponentCommit
}

