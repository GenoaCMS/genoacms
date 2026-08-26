import type { ComponentHeaderReference } from '../componentHeader/component/types'

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
 *
 * **Nothing here says which publication is current.** That is `PublishedComponent`'s, which answers
 * for a prebuilt component too — this holds only what the last publication *compiled*, which is the
 * half a header cannot recover.
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
  publishedSignature: string
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
