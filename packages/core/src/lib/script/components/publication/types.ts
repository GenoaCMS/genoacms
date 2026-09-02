import type { ComponentHeaderReference } from '../componentHeader/component/types'

type ComponentPublicationReference = string

/**
 * What the browser sends to publish.
 *
 * Deliberately without a publisher. The publisher is established from the session on the server; a
 * client permitted to name it could attribute its publication to another principal, and the signed
 * documents would carry that claim.
 */
interface ComponentPublicationOrder {
  componentId: ComponentHeaderReference
  note: string
}

/**
 * A pointer to a component's most recent publication.
 *
 * **The one mutable thing in a design that is otherwise write-once.** Every publication directory is
 * immutable, so nothing inside one can say which is newest; and publication identifiers are UUIDs,
 * so listing the directory and sorting would not answer it either. This record is rewritten on each
 * publication and holds the answer.
 *
 * It exists for **both kinds**, and that is what it is for. A dynamic component's definition already
 * records what it last published, but a prebuilt component has no definition — without this there
 * would be no way to tell a published prebuilt component from an unpublished one, and the registrar
 * could not show either of them a status.
 *
 * `headerDigest` is the describing half of the last published header. It is what `no change, no
 * publication` compares against, and it is the only part of that rule a prebuilt component has.
 */
interface PublishedComponent {
  uid: ComponentHeaderReference
  publicationId: ComponentPublicationReference
  publisherId: string
  publishedAt: number
  note: string
  headerDigest: string
}

export type {
  ComponentPublicationReference,
  ComponentPublicationOrder,
  PublishedComponent
}
