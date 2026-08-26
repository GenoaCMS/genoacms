import type { ComponentExecutable, ExecutablePlatform } from '@genoacms/internal/executable'
import type { DocumentType, SignedEnvelope } from '$lib/script/signing/envelope'
import type { JsonValue } from '$lib/script/signing/canonical'

/**
 * Assembling the artifact a consumer executes.
 *
 * Pure: no storage, no keys, no clock of its own. Signing is next door in `executable.server.ts`,
 * and writing belongs to the delivery layer, so what this file decides is only **what the signature
 * will cover**.
 *
 * ## Every field is attested, so every field has to be supplied
 *
 * The envelope's digest covers this payload whole. A member the caller forgot is not a smaller
 * document — canonicalization drops an `undefined` member silently, and the signature would then
 * attest to a payload nobody supplied. So the builder takes each fact explicitly and refuses rather
 * than defaults: there is no sensible stand-in for "who committed this".
 */

/** The type identifier this payload travels under. Versioned, so the shape can change later without
 * leaving old signatures ambiguous about which one they attested to. */
const EXECUTABLE_DOCUMENT: DocumentType = 'genoacms.componentExecutable.v1'

/** Everything the CMS knows about a revision, minus what the server establishes at compile time. */
interface ExecutableSubject {
  /** The component this belongs to. */
  uid: string
  /** The revision it was built from. */
  publicationId: string
  /** The principal who committed that revision — `AuthContext.subject`. */
  publisherId: string
  /** When they committed it. */
  publishedAt: number
}

class ExecutableError extends Error {
  constructor (readonly field: string, message: string) {
    super(message)
    this.name = 'ExecutableError'
  }
}

/**
 * Refuses an identifier that is absent or blank.
 *
 * Blank counts as absent. An empty `publisherId` would sign cleanly and produce an artifact attributing
 * itself to nobody, which reads as attribution while carrying none.
 */
const requireIdentifier = (field: string, value: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ExecutableError(field, `A component executable needs a ${field}`)
  }
  return value
}

/** Refuses a timestamp that is not a finite number of milliseconds. */
const requireTimestamp = (field: string, value: number): number => {
  if (!Number.isFinite(value)) {
    throw new ExecutableError(field, `A component executable needs a numeric ${field}`)
  }
  return value
}

/**
 * Refuses an empty bundle.
 *
 * The compiler already refuses a source that compiles to nothing, so reaching here empty means the
 * pipeline lost the output between the two. Signing it would publish a verifiable artifact that
 * renders nothing, and the signature would say it was meant.
 */
const requireCode = (executableCode: string): string => {
  if (typeof executableCode !== 'string' || executableCode.trim() === '') {
    throw new ExecutableError('executableCode', 'A component executable needs compiled code')
  }
  return executableCode
}

/**
 * Builds the payload for one platform.
 *
 * `compiledAt` is taken as an argument rather than read from the clock here, so that the payload is
 * a function of its inputs and a test can assert the exact bytes that get signed.
 */
const buildComponentExecutable = (
  subject: ExecutableSubject,
  platform: ExecutablePlatform,
  executableCode: string,
  compiledAt: number
): ComponentExecutable => ({
  uid: requireIdentifier('uid', subject.uid),
  publicationId: requireIdentifier('publicationId', subject.publicationId),
  publisherId: requireIdentifier('publisherId', subject.publisherId),
  publishedAt: requireTimestamp('publishedAt', subject.publishedAt),
  platform,
  executableCode: requireCode(executableCode),
  compiledAt: requireTimestamp('compiledAt', compiledAt)
})

/**
 * The payload as the signer takes it.
 *
 * `ComponentExecutable` is a flat record of strings and numbers, so this is a cast rather than a
 * conversion — it exists because `JsonValue` is what the canonicalizer accepts, and stating the
 * conversion in one place keeps the assertion out of the call sites.
 */
const executablePayload = (executable: ComponentExecutable): JsonValue =>
  executable as unknown as JsonValue

/**
 * An envelope known to carry an executable.
 *
 * Not `SignedEnvelope<ComponentExecutable>`. That generic constrains its payload to `JsonValue`,
 * which an interface without an index signature does not satisfy — a signed executable is
 * nonetheless perfectly canonicalizable, so the constraint is about how the type is declared rather
 * than about the document. Replacing the member says the same thing without loosening
 * `ComponentExecutable` into a bag that accepts any key.
 *
 * `Omit` rather than an intersection: intersecting would leave the payload as `JsonValue &
 * ComponentExecutable`, which still admits a string, and a caller could then not so much as spread
 * it.
 */
type SignedComponentExecutable = Omit<SignedEnvelope, 'payload'> & { payload: ComponentExecutable }

export {
  EXECUTABLE_DOCUMENT,
  ExecutableError,
  buildComponentExecutable,
  executablePayload
}

export type {
  ExecutableSubject,
  SignedComponentExecutable
}
