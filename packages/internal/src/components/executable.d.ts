/**
 * The artifact a consumer executes.
 *
 * A component's source is authored in the CMS and never leaves it. What leaves is this: a compiled
 * bundle for one target platform, produced once per commit, written to a path that is never
 * rewritten, and signed.
 *
 * ## It is a payload, not a self-signed object
 *
 * There is no `signature` or `keyId` here. An executable travels inside the same signed envelope
 * every other published document uses, and that envelope's digest covers the algorithm, the key
 * identifier and the document type **together with** this payload. Binding them closes three
 * substitutions otherwise available to anyone who can write to the bucket: weakening the algorithm
 * to a lesser registered one, rewriting the key identifier to a key whose signatures they can
 * produce, and lifting a valid signature from one document onto another.
 *
 * An artifact that carried its own signature would need those protections written a second time, or
 * would go without them — and a consumer would have two shapes to verify instead of one.
 *
 * ## What is inside, and why
 *
 * `authorId` is load-bearing rather than informational. Containment of a determined author is not
 * claimed, so attribution is what makes the audit trail real: without it a signature proves *this
 * instance produced this artifact*, not *this author shipped it*.
 *
 * The two timestamps are genuinely different facts. `committedAt` is when a person committed the
 * revision; `compiledAt` is when the server built and signed it. They diverge whenever an artifact
 * is rebuilt, and collapsing them would lose the distinction exactly when it matters.
 */

/**
 * Where an artifact runs. One commit may be compiled for several.
 *
 * An open string, not a fixed list, for the reason `ComponentLanguage` is one: platforms come from
 * language adapters, and a closed union here would mean that a third-party adapter emitting
 * `android-dex` could not name its own target without the CMS being edited to permit it.
 *
 * **This value is inside the signed payload**, so it is part of what a consumer verifies. Openness
 * therefore does not mean laxity: a consumer refuses an artifact built for a platform it cannot run,
 * and refuses it *after* verifying the signature — an unrecognized platform is a correctly signed
 * artifact meant for somebody else, not a corrupted one.
 */
type ExecutablePlatform = string

interface ComponentExecutable {
  /** The component this belongs to. */
  uid: string
  /** The revision it was built from. Opaque — an identifier, not a digest of anything. */
  commitId: string
  /** Who committed that revision. */
  authorId: string
  /** When they committed it. */
  committedAt: number
  /** The target this bundle was built for. */
  platform: ExecutablePlatform
  /** The bundle itself, ready to execute. */
  executableCode: string
  /** When the server compiled and signed it. */
  compiledAt: number
}

export type {
  ExecutablePlatform,
  ComponentExecutable
}
