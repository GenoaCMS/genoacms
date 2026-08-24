/**
 * The published page: what a consumer fetches and renders.
 *
 * ## A node names a revision, not a copy of the code
 *
 * A dynamic node used to carry `componentCode` — the component's **source**, uncompiled, embedded in
 * the page. Three things were wrong with that at once. A consumer had to compile at render time,
 * which is the delivery model the compiled artifact exists to replace. The source was republished
 * into every page using the component, so one component's code lived in as many places as it had
 * pages. And nothing said *which* revision a page had been built against, so a page named a
 * component and the component could change underneath it.
 *
 * A node now carries `commitId`. Publishing pins the revision current at that moment, and the
 * artifact for that revision is written once and never rewritten — so the pin resolves to the same
 * bytes forever, and committing a newer revision does not change a published page until the page is
 * republished.
 *
 * ## Prebuilt nodes have no revision, and no artifact
 *
 * A prebuilt component is code the consuming application already contains; the CMS holds only its
 * name and its attribute schema. There is nothing for the CMS to pin, so `uid` and `commitId` are
 * absent rather than empty — the two are different documents once signed, and absence is what says
 * "this one is resolved by name".
 *
 * ## A dynamic node carries its uid as well as its name
 *
 * The two do different jobs. The **name** is what a consumer matches against its own component map,
 * and what a person reads. The **uid** is where the artifact lives: executables are published to
 * `{uid}/{commitId}`, so without it a consumer holds a pin it cannot resolve.
 *
 * Addressing artifacts by name instead would be cheaper here and wrong: names are not unique, and a
 * dynamic component's name is the function its source declares — renaming one rewrites its code and
 * would orphan every artifact already published under the old name.
 */

/**
 * A rendered attribute value.
 *
 * `Array<string>` is what links and storage resources resolve to: both are lists, and each entry
 * resolves to a URL.
 */
type ReadableAttributeValue =
  | boolean
  | number
  | string
  | Array<string>
  | Array<ReadablePageNode>

interface ReadablePageNode {
  /** The component's name. For a prebuilt node, what the consumer resolves against its own map. */
  component: string
  /**
   * Which component this is, for a component authored in the CMS.
   *
   * Present exactly when `commitId` is: together they name the artifact to fetch. Absent for a
   * prebuilt component, which has none.
   */
  uid?: string
  /**
   * The revision this node was pinned to, for a component authored in the CMS.
   *
   * Absent for a prebuilt component, which has no revision the CMS controls.
   */
  commitId?: string
  data: Record<string, ReadableAttributeValue>
}

export type {
  ReadableAttributeValue,
  ReadablePageNode
}
