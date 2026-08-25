import type { Diff } from 'deep-diff'
import type { ComponentHeaderReference } from '../componentHeader/component/types'

type ComponentReference = string
type ComponentCommitReference = string
type ComponentCode = string
/**
 * The language a component is authored in.
 *
 * An open string, not a fixed list. Languages are supplied by adapters declared in `genoa.config`,
 * so a closed union here would mean that adding one required editing the CMS — which is the opposite
 * of what the adapters are for. An unrecognized value is caught when the adapter is resolved, and
 * the error says which languages are configured.
 */
type ComponentLanguage = string
type CodeChange = Array<Diff<ComponentCode>>

interface ComponentCreation {
  name: string,
}

interface ComponentDeletion extends ComponentCreation {
  uid: ComponentHeaderReference
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

/**
 * A committed revision.
 *
 * `authorId` is not part of `ComponentCommitOrder`, which is what the browser sends. It is taken
 * from the authenticated principal on the server, because a client that could name the author could
 * attribute its own commit to somebody else — and the signed executable built from this revision
 * carries that name as its audit trail.
 */
interface ComponentCommit extends ComponentCommitOrder {
  uid: ComponentCommitReference,
  timestamp: number,
  /** The principal who committed it — `AuthContext.subject`. */
  authorId: string,
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
