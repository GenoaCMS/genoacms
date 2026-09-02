import type { ComponentType } from '$lib/script/components/componentHeader/component/types'

/**
 * The published page: what a consumer fetches and renders.
 *
 * ## A node names a publication, not a copy of the code
 *
 * A dynamic node used to carry `componentCode` — the component's **source**, uncompiled, embedded in
 * the page. Three things were wrong with that at once. A consumer had to compile at render time,
 * which is the delivery model the compiled artifact exists to replace. The source was republished
 * into every page using the component, so one component's code lived in as many places as it had
 * pages. And nothing said *which* revision a page had been built against, so a page named a
 * component and the component could change underneath it.
 *
 * A node now carries `publicationId`. Publishing pins the publication current at that moment, and
 * everything that publication wrote is written once and never rewritten — so the pin resolves to the
 * same bytes forever, and editing the component afterwards does not change a published page until
 * the page is republished.
 *
 * ## Both kinds are pinned, and the kind is stated rather than inferred
 *
 * A prebuilt node used to be recognized by having **no** pin: its code lives in the consuming
 * application, so there was no artifact and nothing to name. That stopped being true when a
 * component's **description** became a published document. A prebuilt component now publishes a
 * signed header — its name, its attributes, and above all the order they are passed in — so it has a
 * publication to pin like any other, and absence distinguishes nothing.
 *
 * So the node states its `type`. A consumer reads it to know what to expect at the publication:
 * a header alone, or a header and a bundle. Leaving it to be inferred from what happens to be
 * stored would let whoever can write to the bucket decide which of the two a node is.
 *
 * **What does not change** is how a prebuilt component is *run*: it is still resolved by `component`
 * against the consuming application's own map. Publishing its description does not publish its
 * implementation — it replaces the consumer's local assumption about the parameter order with
 * something signed.
 *
 * ## A node carries its uid as well as its name
 *
 * The two do different jobs. The **name** is what a consumer matches against its own component map,
 * and what a person reads. The **uid** is where the publication lives: documents are published to
 * `{uid}/{publicationId}`, so without it a consumer holds a pin it cannot resolve.
 *
 * Addressing publications by name instead would be cheaper here and wrong: names are not unique, and
 * a dynamic component's name is the function its source declares — renaming one rewrites its code
 * and would orphan every artifact already published under the old name.
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
  /** The component's name. What the consumer resolves against its own map for a prebuilt node. */
  component: string
  /**
   * Which kind of component this is.
   *
   * Stated, not inferred from whether a pin is present — both kinds are pinned now, so absence says
   * nothing. It is what tells a consumer whether to expect code at the publication.
   */
  type: ComponentType
  /**
   * Which component this is.
   *
   * Present exactly when `publicationId` is: together they name the publication to fetch.
   */
  uid?: string
  /**
   * The publication this node was pinned to.
   *
   * **Absent only for a component that has never been published**, which has nothing to pin. Such a
   * node names a component a consumer cannot resolve, and it is the consumer's verification that
   * refuses to render it rather than anything here. Composing a page from unpublished components is
   * what the page editor stops offering once composition is limited to published components.
   */
  publicationId?: string
  data: Record<string, ReadableAttributeValue>
}

export type {
  ReadableAttributeValue,
  ReadablePageNode
}
