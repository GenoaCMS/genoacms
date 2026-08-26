import type { ComponentHeader } from '../componentHeader/component/types'
import { sign } from '$lib/script/signing/envelope'
import { getCurrentSigningKey } from '$lib/script/signing/keyResolution.server'
import {
  HEADER_DOCUMENT,
  buildPublishedHeader,
  headerPayload,
  type HeaderSubject,
  type SignedComponentHeader
} from './header'

/**
 * Signing a component header.
 *
 * The same envelope, the same current subordinate key and the same verification path as an
 * executable and an authorization manifest. Nothing here is specific to headers except the document
 * type — which is the point: a consumer that can verify one document can verify all of them.
 */
const signComponentHeader = async (
  subject: HeaderSubject,
  header: ComponentHeader
): Promise<SignedComponentHeader> => {
  const published = buildPublishedHeader(subject, header)
  const key = await getCurrentSigningKey()
  const envelope = sign(HEADER_DOCUMENT, headerPayload(published), key)

  // Restating the payload rather than casting the envelope. It is the same object the signer was
  // handed, so this changes nothing about what was signed — it recovers the type that had to be
  // widened to `JsonValue` on the way in.
  return { ...envelope, payload: published }
}

export { signComponentHeader }
