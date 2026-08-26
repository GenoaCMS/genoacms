import { ROOT_ALGORITHM, getAlgorithm } from './algorithms.js'
import { peekUnverifiedHeader, verifyEnvelope } from './envelope.js'
import { KEY_REGISTRY_DOCUMENT, readRegistry, resolveKey, type KeyRegistry } from './registry.js'
import { PAGE_TREE_DOCUMENT, readPageTree, type ReadablePageNode } from './pageTree.js'
import {
  EXECUTABLE_DOCUMENT,
  readExecutable,
  matchesPin,
  isRunnable,
  WEB_ESMODULE,
  type ComponentExecutable
} from './executable.js'
import {
  HEADER_DOCUMENT,
  readHeader,
  matchesPin as headerMatchesPin,
  sharesPublication,
  type PublishedComponentHeader
} from './header.js'
import type { JsonValue } from './canonical.js'

/**
 * A verifier bound to one instance.
 *
 * ## Two things, and nothing else
 *
 * The specification is explicit that a verifier needs the instance's **root public key**, embedded
 * at build time, and the ability to **fetch** from its storage. No other configuration, no network
 * service, no clock. Everything this class does follows from those two.
 *
 * "The ability to fetch" arrives as a `Source`, which is one method. The SDK keeps every path, the
 * order they are visited in, and what each is verified as — a consumer never assembles a URL or
 * decides what to read next. What it supplies is how bytes are obtained, which is the only part that
 * depends on where the instance's storage is and who is allowed to read it.
 *
 * That seam is why the SDK holds no credentials and names no storage vendor. A consumer reading a
 * private bucket implements `read` with the client it already has; one reading a CDN uses the HTTP
 * source below and passes a base URL.
 *
 * The root key is 32 bytes and is the consumer's to supply — it is the whole trust decision, and it
 * is why rotating the root means redeploying every consumer while rotating a subordinate means
 * publishing a new registry.
 *
 * ## Stateful about rollback, and it says so
 *
 * A signature says a document came from the instance, **not when**. So an older registry replays a
 * valid signature and undoes whatever a newer one recorded — a revocation, above all. This verifier
 * keeps the highest `sequence` it has seen and refuses anything below it.
 *
 * The specification notes that a stateless verifier cannot do this and is correspondingly weaker,
 * and asks each implementation to say which it is. This one is stateful **for the lifetime of the
 * instance it is used through**: a fresh page load starts with no high-water mark, so the protection
 * holds within a session and not across one. Persisting it is the consumer's to add, and needs
 * storage this SDK deliberately does not assume.
 *
 * ## Two answers, and a third thing that is not an answer
 *
 * A verifier answers **valid** or **invalid**, and the specification is explicit that malformed
 * input is invalid rather than an error — an implementation that raises on a truncated signature
 * turns a failed verification into a crashed request. So a verdict is **returned**.
 *
 * Failing to *fetch* is neither verdict, and is the one thing that **throws**. A caller that treated
 * an outage as "invalid" would reject good documents whenever the network faltered; one that treated
 * it as valid would accept anything during an outage. Making one a return value and the other an
 * exception is what stops the two being confused at a call site.
 */

/** Either answer a verifier has. Never thrown — see the note above. */
type Verdict<T> =
  | { valid: true, value: T }
  | { valid: false, reason: string }

/**
 * Where the instance's documents come from.
 *
 * One method, because that is all the SDK needs and everything beyond it is a decision the consumer
 * is better placed to make.
 *
 * **The two failure shapes are different answers and must stay apart.** `undefined` means nothing is
 * stored at that path — an ordinary state, such as a page that was never published. A **throw** means
 * storage could not be reached, which is not a verdict about any document: a caller that read an
 * outage as "does not verify" would reject good documents whenever the network faltered.
 *
 * Addressed by path alone. All component data lives in the instance's primary bucket today; if that
 * ever stops being true this becomes `read({ bucket, path })`.
 */
interface Source {
  read: (path: string) => Promise<string | undefined>
}

interface VerifierOptions {
  /** The instance's root public key: 32 bytes, embedded at build time. */
  rootPublicKey: Uint8Array
  /** How documents are read. See `Source`. */
  source: Source
  /**
   * Platforms this consumer can execute, defaulting to `web-esmodule`.
   *
   * Configurable because where a component runs is the consumer's choice — verifying on a server and
   * executing in a browser is as valid as doing both in one place — and a runtime that can run
   * something else says so here rather than being told what it is.
   */
  platforms?: readonly string[]
}

/**
 * A `Source` that reads over HTTP, for a consumer serving artifacts from a CDN or a public origin.
 *
 * A 404 is `undefined` — nothing published there. Any other unsuccessful status throws, because it
 * says the request failed rather than that the object is absent.
 */
const httpSource = (baseURL: string, fetchImpl: typeof globalThis.fetch = globalThis.fetch): Source => {
  const origin = baseURL.replace(/\/+$/, '')
  return {
    read: async (path) => {
      const response = await fetchImpl(`${origin}/${path}`)
      if (response.status === 404) return undefined
      if (!response.ok) {
        throw new UnreachableError('fetch-failed', `${path}: HTTP ${response.status}`)
      }
      return await response.text()
    }
  }
}

/** Raised only when the answer could not be reached at all. Never for a document that failed. */
class UnreachableError extends Error {
  constructor (readonly reason: string, message?: string) {
    super(message ?? reason)
    this.name = 'UnreachableError'
  }
}

/** Where the registry lives. Fixed by the specification, not configurable. */
const REGISTRY_PATH = '.genoacms/keys/public.json'

/** Where a published page lives. The CMS's layout, which is why a consumer never assembles one. */
const pageTreePath = (name: string): string => `.genoacms/pages/readables/${name}`

/**
 * Where a publication's compiled code lives. Immutable, which is what lets a consumer cache forever.
 *
 * One directory per publication, holding the signed header and — for a component that has code —
 * this. It used to sit under the source it was built from, at
 * `dynamic/executables/{uid}/{publicationId}.json`, which said a publication was a fact about code.
 * It is a fact about a component, and a component with no code publishes into the same layout.
 */
const executablePath = (uid: string, publicationId: string): string =>
  `.genoacms/components/public/${uid}/${publicationId}/executable.json`

/** Where a publication's signed description lives. Present for every component, coded or not. */
const headerPath = (uid: string, publicationId: string): string =>
  `.genoacms/components/public/${uid}/${publicationId}/header.json`

/**
 * A publication as a consumer uses it: what the component accepts, and the code to run if it has any.
 *
 * `executable` is absent exactly when the header says `prebuilt` — such a component's code lives in
 * the consuming application, and the header is the whole of what the CMS published.
 */
interface PublishedComponent {
  header: PublishedComponentHeader
  executable?: ComponentExecutable
}

class Verifier {
  readonly #rootPublicKey: Uint8Array
  readonly #source: Source
  readonly #platforms: readonly string[]

  /** The highest registry sequence seen. See the note on rollback above. */
  #highWaterMark = 0
  #registry: KeyRegistry | undefined

  constructor (options: VerifierOptions) {
    if (getAlgorithm(ROOT_ALGORITHM) === undefined) {
      throw new UnreachableError('root-algorithm-unavailable', `${ROOT_ALGORITHM} is not built in`)
    }
    this.#rootPublicKey = options.rootPublicKey
    this.#source = options.source
    this.#platforms = options.platforms ?? [WEB_ESMODULE]
  }

  /**
   * Reads a path and parses it, keeping "nothing there" apart from "not JSON".
   *
   * An absent object is reported as `undefined` for the caller to interpret. Text that is not JSON is
   * a transport-shaped failure: nothing arrived that could be judged either way.
   */
  async #readJSON (path: string): Promise<unknown | undefined> {
    const text = await this.#source.read(path)
    if (text === undefined) return undefined
    try {
      return JSON.parse(text)
    } catch {
      throw new UnreachableError('not-json', `${path} is not JSON`)
    }
  }

  /**
   * Fetches the registry and establishes it, in the order the specification sets out.
   *
   * Verified against the **root** rather than through itself: the registry is what makes every other
   * key resolvable, so it cannot be resolved through the thing it defines. That is what makes the
   * chain terminate.
   */
  async loadRegistry (): Promise<Verdict<KeyRegistry>> {
    const candidate = await this.#readJSON(REGISTRY_PATH)
    // An instance with no registry is not an instance this SDK can verify anything against, so this
    // is a failure to reach rather than a document that did not verify.
    if (candidate === undefined) throw new UnreachableError('registry-absent', REGISTRY_PATH)

    const verified = verifyEnvelope(candidate, KEY_REGISTRY_DOCUMENT, this.#rootPublicKey)
    if (!verified.valid) return { valid: false, reason: verified.reason }

    const registry = readRegistry(verified.payload)
    if (typeof registry === 'string') return { valid: false, reason: registry }

    if (registry.sequence < this.#highWaterMark) {
      return {
        valid: false,
        reason: `registry-rollback: sequence ${registry.sequence} is below ${this.#highWaterMark}, already seen`
      }
    }

    this.#highWaterMark = registry.sequence
    this.#registry = registry
    return { valid: true, value: registry }
  }

  /** The established registry, loading it on first use. */
  async registry (): Promise<Verdict<KeyRegistry>> {
    if (this.#registry !== undefined) return { valid: true, value: this.#registry }
    return await this.loadRegistry()
  }

  /**
   * Verifies a document that a subordinate key signed.
   *
   * The caller says which type it asked storage for. Nothing read from the envelope before
   * verification is used for anything but finding the key.
   */
  async verifyDocument (candidate: unknown, expectedType: string): Promise<Verdict<JsonValue>> {
    const header = peekUnverifiedHeader(candidate)
    if (header === undefined) return { valid: false, reason: 'not-an-envelope' }

    const registry = await this.registry()
    if (!registry.valid) return registry

    const publicKey = resolveKey(registry.value, header.keyId)
    if (publicKey === undefined) {
      return { valid: false, reason: `key-unresolvable: ${header.keyId} is unknown or revoked` }
    }

    const verified = verifyEnvelope(candidate, expectedType, publicKey)
    if (!verified.valid) return { valid: false, reason: verified.reason }
    return { valid: true, value: verified.payload }
  }

  /**
   * The compiled artifact a node pinned: fetched, verified, and checked against the pin.
   *
   * Three things a valid signature does not settle are checked here, in this order — the artifact is
   * shaped like one, it is the revision that was asked for, and this runtime can execute it.
   *
   * The middle one is the attack worth naming. Whoever can write to storage can move a **genuine,
   * correctly signed** executable of an older revision onto the path a newer one occupies. Every
   * signature involved stays valid; only comparing what the page pinned against what the artifact
   * says it is catches it.
   *
   * `undefined` means nothing is published there — a page pinning a revision whose artifact was
   * never written, or has since been deleted.
   */
  async executable (
    pin: { uid: string, publicationId: string }
  ): Promise<Verdict<ComponentExecutable> | undefined> {
    const verified = await this.fetchVerified(executablePath(pin.uid, pin.publicationId), EXECUTABLE_DOCUMENT)
    if (verified === undefined) return undefined
    if (!verified.valid) return verified

    const read = readExecutable(verified.value)
    if (!read.ok) return { valid: false, reason: read.reason }

    const pinned = matchesPin(read.value, pin)
    if (!pinned.ok) return { valid: false, reason: pinned.reason }

    const runnable = isRunnable(pinned.value, this.#platforms)
    if (!runnable.ok) return { valid: false, reason: runnable.reason }

    return { valid: true, value: runnable.value }
  }

  /**
   * The description a node pinned: fetched, verified, and checked against the pin.
   *
   * The same three questions the executable is asked, minus the platform — a description has no
   * runtime. The pin check matters for the same reason it does there: whoever can write to storage
   * can move a **genuine, correctly signed** header of an older publication onto a newer one's path,
   * and every signature stays valid.
   *
   * When the pin carries a `type` — as one taken from a page node does — that is compared as well,
   * because the page and the header state it under separate signatures and only comparing them
   * catches one having been changed.
   *
   * `undefined` means nothing is published there — a page pinning a publication whose header was
   * never written, or has since been deleted.
   */
  async componentHeader (
    pin: { uid: string, publicationId: string, type?: PublishedComponentHeader['type'] }
  ): Promise<Verdict<PublishedComponentHeader> | undefined> {
    const verified = await this.fetchVerified(headerPath(pin.uid, pin.publicationId), HEADER_DOCUMENT)
    if (verified === undefined) return undefined
    if (!verified.valid) return verified

    const read = readHeader(verified.value)
    if (!read.ok) return { valid: false, reason: read.reason }

    const pinned = headerMatchesPin(read.value, pin)
    if (!pinned.ok) return { valid: false, reason: pinned.reason }

    return { valid: true, value: pinned.value }
  }

  /**
   * A whole publication: the description, and the code when the component has any.
   *
   * **This is the method a renderer should use**, and the reason it exists rather than leaving a
   * consumer to call the two above in sequence is that the pair has to be checked *against each
   * other*. They are separate objects, fetched separately and cached separately, so a consumer can
   * hold a correctly signed header from one publication and a correctly signed executable from
   * another — the shapes disagree, the bundle is called with the wrong parameter list, and nothing
   * in either document is invalid.
   *
   * **The header decides whether an executable is expected**, which is what the published type is
   * for. A `prebuilt` component's code lives in the consuming application, so a bundle appearing
   * beside its header is not something to run: it is a publication that should not exist, and
   * refusing is the only answer that does not depend on guessing which document is right.
   *
   * `undefined` means nothing is published at that publication at all.
   *
   * A pin taken straight from a page node carries the kind the page claimed, and it is checked
   * against the header's before anything else is decided — see `matchesPin`.
   */
  async component (
    pin: { uid: string, publicationId: string, type?: PublishedComponentHeader['type'] }
  ): Promise<Verdict<PublishedComponent> | undefined> {
    const header = await this.componentHeader(pin)
    if (header === undefined) return undefined
    if (!header.valid) return header

    const executable = await this.executable(pin)

    if (header.value.type === 'prebuilt') {
      // Refused rather than ignored. An executable here is either a header that has been swapped
      // for a prebuilt one, or a bundle nobody asked for — both are reasons to stop.
      if (executable !== undefined) {
        return {
          valid: false,
          reason: `component-unexpected-executable: ${pin.uid} is prebuilt, so its code lives in ` +
            'the consuming application, yet an executable is published beside its header'
        }
      }
      return { valid: true, value: { header: header.value } }
    }

    // A dynamic component with no bundle is a publication that renders nothing. Kept apart from
    // "nothing is published here", which the caller reads as an unpublished component.
    if (executable === undefined) {
      return {
        valid: false,
        reason: `component-missing-executable: ${pin.uid} is dynamic, so ${pin.publicationId} ` +
          'should have published code, and none is there'
      }
    }
    if (!executable.valid) return executable

    const bound = sharesPublication(header.value, executable.value)
    if (!bound.ok) return { valid: false, reason: bound.reason }

    return { valid: true, value: { header: header.value, executable: executable.value } }
  }

  /**
   * Fetches a path and verifies it as the document type the caller expects.
   *
   * Throws if the object cannot be fetched; returns a verdict about it otherwise.
   */
  async fetchVerified (path: string, expectedType: string): Promise<Verdict<JsonValue> | undefined> {
    const candidate = await this.#readJSON(path)
    if (candidate === undefined) return undefined
    return await this.verifyDocument(candidate, expectedType)
  }

  /**
   * The published page for a name: fetched, verified, and read into a tree.
   *
   * **A tree that does not verify is not returned in any form.** There is no safe degraded shape to
   * fall back to — the plausible tampering repoints a node at a different component, or at an older
   * revision of the same one, and leaves a document that looks entirely ordinary. Rendering it would
   * be rendering whatever was written to the bucket.
   *
   * `undefined` means the page was never published, which is an ordinary answer and a different one
   * from a page that failed to verify.
   */
  async pageTree (name: string): Promise<Verdict<ReadablePageNode> | undefined> {
    const verified = await this.fetchVerified(pageTreePath(name), PAGE_TREE_DOCUMENT)
    if (verified === undefined) return undefined
    if (!verified.valid) return verified

    // Verified and still unusable is possible: a signature attests to the bytes, not to the shape.
    // Whoever holds the signing key can sign a malformed tree.
    const tree = readPageTree(verified.value)
    if (!tree.ok) return { valid: false, reason: tree.reason }
    return { valid: true, value: tree.value }
  }
}

export {
  Verifier, UnreachableError, REGISTRY_PATH, pageTreePath, executablePath, headerPath, httpSource
}
export type { VerifierOptions, Verdict, Source, PublishedComponent }
