import type { ComponentHeader } from '../componentHeader/component/types'
import { sign } from '$lib/script/signing/envelope'
import { getCurrentSigningKey } from '$lib/script/signing/keyResolution.server'
import {
  PUBLICATION_DOCUMENT,
  buildComponentPublication,
  publicationPayload,
  type ReleaseSubject,
  type PublishedExecutable,
  type SignedComponentPublication
} from './payload'

/**
 * Signing a publication.
 *
 * The same envelope, the same current subordinate key and the same verification path as an
 * authorization manifest and a page tree. Nothing here is specific to components except the document
 * type — which is the point: a consumer that can verify one document can verify all of them.
 *
 * ## One signature per release, where there were two
 *
 * A dynamic component used to pay for two ML-DSA-65 signatures and carry both on the wire — about
 * 6.6 KB of signature for one release, before base64. It now pays for one. The saving is real but it
 * is the lesser reason; the reason is that a single signature cannot attest to half a publication.
 *
 * ## Signed by a subordinate, not the root
 *
 * The root anchor signs the key registry and the security policy and nothing else. Those are written
 * rarely; publications are written whenever anyone releases anything, and a scheme whose signing
 * takes over a second and whose signature is 7.8 KB would be paid on each one. More to the point, a
 * key that signs often is a key that must be able to rotate, and rotating the root means rebuilding
 * every consumer.
 */
const signComponentPublication = async (
  subject: ReleaseSubject,
  header: ComponentHeader,
  executables?: PublishedExecutable[]
): Promise<SignedComponentPublication> => {
  const publication = buildComponentPublication(subject, header, executables)
  const key = await getCurrentSigningKey()
  const envelope = sign(PUBLICATION_DOCUMENT, publicationPayload(publication), key)

  // Restating the payload rather than casting the envelope. It is the same object the signer was
  // handed, so this changes nothing about what was signed — it recovers the type that had to be
  // widened to `JsonValue` on the way in.
  return { ...envelope, payload: publication }
}

export { signComponentPublication }
