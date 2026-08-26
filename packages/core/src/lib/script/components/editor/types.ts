import type { ComponentHeaderReference } from '../componentHeader/component/types'
import type { ComponentPublicationReference } from '../publication/types'

type ComponentReference = string
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

interface ComponentCreation {
  name: string,
}

interface ComponentDeletion extends ComponentCreation {
  uid: ComponentHeaderReference
}

/**
 * A component's source, as the CMS holds it.
 *
 * **Two bodies, and there is exactly one act.** `body` is the draft, rewritten on every edit that
 * lands; `publishedBody` is what the last publication compiled. The comparison between them is half
 * of `no change, no publication` — the other half is the header, which the publication module owns.
 *
 * There is no third body and no commit history. Marking reference points in the source was tried and
 * removed: publication is the only act that produces anything, and a second gate in front of it made
 * a shape change something neither act could record. **Undo and redo during drafting are the
 * `UndoRedoAdjunct`'s**, the same one the page and registrar editors use — which is what a commit
 * would mostly have been used for, done in the surface where the editing happens rather than as a
 * stored revision of its own.
 */
interface ComponentDefinition {
  uid: ComponentReference,
  language: ComponentLanguage,
  /** The draft, and what a publication is built from. Written on every edit that lands. */
  body: ComponentCode,
  /** What the most recent publication was built from, or empty if nothing has been published. */
  publishedBody: ComponentCode,
  /**
   * The signature that publication was built against.
   *
   * Stored rather than recomputed from the header, because the header is what an author is free to
   * change: the question `no change, no publication` asks is whether the *current* shape still emits
   * what the last publication compiled, and the header alone cannot answer it.
   */
  publishedSignature: string,
  /**
   * The publication a page pins when it is built.
   *
   * **Absent until something has been published**, which is what a page-tree build reads to decide
   * that a component has nothing to serve yet.
   *
   * Duplicated, knowingly: `PublishedComponent.publicationId` holds the same value for both kinds of
   * component, and is what the registrar reads to show a status. This copy exists because the page
   * build already reads the definition and the pin is dynamic-only today. **When the page tree
   * learns to pin a prebuilt component's publication, the pin should move to the pointer record and
   * this field should go** — one fact in two places is one place too many.
   */
  lastPublicationId?: ComponentPublicationReference
}

interface Component extends ComponentCreation {
  uid: ComponentReference,
}

interface ComponentCodeChange {
  uid: ComponentReference,
  body: string
}

export type {
  ComponentCreation,
  ComponentDeletion,
  ComponentReference,
  ComponentCode,
  ComponentLanguage,
  ComponentDefinition,
  Component,
  ComponentCodeChange
}
