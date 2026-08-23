import type { ExecutablePlatform } from '@genoacms/internal/executable'
import { sign } from '$lib/script/signing/envelope'
import { getCurrentSigningKey } from '$lib/script/signing/keyResolution.server'
import {
  EXECUTABLE_DOCUMENT,
  buildComponentExecutable,
  executablePayload,
  type ExecutableSubject,
  type SignedComponentExecutable
} from './executable'

/**
 * Signing a compiled component.
 *
 * The same envelope the authorization manifests travel in, signed by the same current subordinate
 * key. Nothing here is specific to executables except the document type — which is the point. A
 * consumer that can verify a manifest can verify an executable, and there is one verification path
 * to get right rather than two.
 *
 * ## Signed by a subordinate, not the root
 *
 * The root anchor signs the key registry and the security policy and nothing else. Those are written
 * rarely; executables are written on every commit, and a scheme whose signing takes over a second
 * and whose signature is 7.8 KB would be paid on each one. More to the point, a key that signs
 * often is a key that must be able to rotate, and rotating the root means rebuilding every consumer.
 */

/**
 * Builds and signs an executable for one platform.
 *
 * `compiledAt` is stamped here, at the moment of signing, because it records when *the server* built
 * the artifact. It is deliberately a different fact from `committedAt`, which came from the person
 * who committed the revision, and the two diverge whenever an artifact is rebuilt.
 */
const signComponentExecutable = async (
  subject: ExecutableSubject,
  platform: ExecutablePlatform,
  executableCode: string
): Promise<SignedComponentExecutable> => {
  const executable = buildComponentExecutable(subject, platform, executableCode, Date.now())
  const key = await getCurrentSigningKey()
  const envelope = sign(EXECUTABLE_DOCUMENT, executablePayload(executable), key)

  // Restating the payload rather than casting the envelope. It is the same object the signer was
  // handed, so this changes nothing about what was signed — it recovers the type that had to be
  // widened to `JsonValue` on the way in.
  return { ...envelope, payload: executable }
}

export {
  signComponentExecutable
}
