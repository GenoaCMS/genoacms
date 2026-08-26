import type { JsonValue } from './canonical.js'
import type { Read } from './pageTree.js'

/**
 * The compiled artifact a consumer runs.
 *
 * Re-stated from the published format rather than imported from the CMS, for the reason the page
 * tree is: this is what an application receives, and an application has no reason to depend on the
 * thing that produced it.
 *
 * ## What is checked, and in what order
 *
 * The signature comes first and is not this file's business. What is left afterwards are three
 * things a valid signature does not settle:
 *
 * - **Is this the revision the page asked for?** An artifact signed by the instance is still the
 *   wrong artifact if it is a different revision. Whoever can write to storage can move a genuine
 *   older executable to the path a newer one should occupy, and every signature involved stays
 *   valid.
 * - **Can this runtime execute it?** A correctly signed artifact built for another platform is one
 *   this SDK must refuse rather than attempt.
 * - **Is it shaped like an executable at all?** A signature attests to bytes, not to their shape.
 */

const EXECUTABLE_DOCUMENT = 'genoacms.componentExecutable.v1'

/** What this SDK can run. Executing an ES module needs an ES module host and nothing else does. */
const WEB_ESMODULE = 'web-esmodule'

interface ComponentExecutable {
  /** The component this belongs to. */
  uid: string
  /** The revision it was built from. */
  publicationId: string
  /** The principal who committed that revision. Attribution, and the audit trail. */
  publisherId: string
  /** When they committed it. */
  publishedAt: number
  /** The target this bundle was built for. */
  platform: string
  /** The bundle itself. */
  executableCode: string
  /** When the server compiled and signed it. */
  compiledAt: number
}

const failed = (reason: string): Read<never> => ({ ok: false, reason })

const isRecord = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const nonEmptyString = (value: JsonValue | undefined): value is string =>
  typeof value === 'string' && value.length > 0

/** Reads a verified payload as an executable, or names what is wrong with it. */
const readExecutable = (payload: JsonValue): Read<ComponentExecutable> => {
  if (!isRecord(payload)) return failed('executable-not-an-object')

  const { uid, publicationId, publisherId, publishedAt, platform, executableCode, compiledAt } = payload

  if (!nonEmptyString(uid)) return failed('executable-missing-uid')
  if (!nonEmptyString(publicationId)) return failed('executable-missing-commit-id')
  // Attribution is what makes the audit trail real, so an artifact attributing itself to nobody is
  // refused rather than rendered anonymously.
  if (!nonEmptyString(publisherId)) return failed('executable-missing-author-id')
  if (typeof publishedAt !== 'number') return failed('executable-missing-committed-at')
  if (!nonEmptyString(platform)) return failed('executable-missing-platform')
  if (typeof compiledAt !== 'number') return failed('executable-missing-compiled-at')
  // Empty code is not an executable with nothing in it — it is a component that renders nothing
  // while carrying a signature saying it was meant to.
  if (!nonEmptyString(executableCode)) return failed('executable-missing-code')

  return {
    ok: true,
    value: { uid, publicationId, publisherId, publishedAt, platform, executableCode, compiledAt }
  }
}

/**
 * Refuses an artifact that is not the revision the page pinned.
 *
 * The page tree is signed and names a revision; the artifact is signed and names the revision it
 * was built from. **Both being genuine is not enough** — they have to be the same one, or the page
 * is rendering a component the publisher did not publish.
 */
const matchesPin = (
  executable: ComponentExecutable,
  expected: { uid: string, publicationId: string }
): Read<ComponentExecutable> => {
  if (executable.uid !== expected.uid) {
    return failed(`executable-wrong-component: expected ${expected.uid}, found ${executable.uid}`)
  }
  if (executable.publicationId !== expected.publicationId) {
    return failed(`executable-wrong-revision: expected ${expected.publicationId}, found ${executable.publicationId}`)
  }
  return { ok: true, value: executable }
}

/**
 * Refuses a platform this SDK cannot run.
 *
 * Checked **after** verification, deliberately. An unrecognized platform is a correctly signed
 * artifact meant for somebody else — a different runtime with its own SDK — rather than a corrupted
 * one, and the two deserve different answers.
 */
const isRunnable = (
  executable: ComponentExecutable,
  platforms: readonly string[] = [WEB_ESMODULE]
): Read<ComponentExecutable> => {
  if (!platforms.includes(executable.platform)) {
    return failed(
      `executable-unsupported-platform: this SDK runs ${platforms.join(', ')}, ` +
      `and this artifact was built for ${executable.platform}`
    )
  }
  return { ok: true, value: executable }
}

export {
  EXECUTABLE_DOCUMENT,
  WEB_ESMODULE,
  readExecutable,
  matchesPin,
  isRunnable
}

export type { ComponentExecutable }
