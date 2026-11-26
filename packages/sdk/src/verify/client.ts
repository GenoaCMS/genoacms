import { ROOT_ALGORITHM, getAlgorithm } from './algorithms.js'
import { peekUnverifiedHeader, rejectBeforeKey, verifyEnvelope } from './envelope.js'
import {
  KEY_REGISTRY_DOCUMENT, readRegistry, readKeyFile, type KeyRegistry, type RegistryKey, type ResolvedKey
} from './registry.js'
import { PAGE_TREE_DOCUMENT, readPageTree, type ReadablePageNode } from './pageTree.js'
import {
  PUBLICATION_DOCUMENT,
  WEB_ESMODULE,
  readPublication,
  matchesPin,
  runnableOn,
  type ComponentPublication,
  type PublishedExecutable,
  type ComponentType
} from './publication.js'
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
 * A signature says a document came from the instance, **not when**. So an older manifest replays a
 * valid signature and undoes whatever a newer one recorded — a revocation, above all. This verifier
 * keeps the highest `sequence` it has seen and refuses anything below it (VFY-2).
 *
 * Without `minimumRegistrySequence` that protection holds for the lifetime of the instance it is
 * used through, and not across one. A consumer that can read the instance's secret mark
 * `GENOACMS_KEY_REGISTRY_SEQUENCE`, stored as `<prefix>__GENOACMS_KEY_REGISTRY_SEQUENCE` under an
 * instance prefix, passes it, and then a restored older manifest is refused on the first load too.
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
  /**
   * The value of the secret `GENOACMS_KEY_REGISTRY_SEQUENCE`, stored as
   * `<prefix>__GENOACMS_KEY_REGISTRY_SEQUENCE` under an instance prefix, read by the consumer where
   * it can be.
   * A manifest with a lower sequence is refused (VFY-2).
   */
  minimumRegistrySequence?: number
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

/** Where a key's public key lives (REG-2). Fetched only when a document it signed is verified. */
const keyFilePath = (keyId: string): string => `.genoacms/keys/public/${keyId}.json`

/** Where a published page lives. The CMS's layout, which is why a consumer never assembles one. */
const pageTreePath = (name: string): string => `.genoacms/pages/readables/${name}`

/**
 * Where a publication lives. Immutable, which is what lets a consumer cache forever.
 *
 * **One object per release.** It used to be a directory holding a signed header and, for a component
 * with code, a signed executable — two documents to fetch, two signatures to check, and a pairing
 * between them that had to be verified separately because neither said the other belonged to it.
 */
const publicationPath = (uid: string, publicationId: string): string =>
  `.genoacms/components/public/${uid}/${publicationId}.json`

/**
 * A publication as a consumer uses it: what the component accepts, and the code to run.
 *
 * `executable` is the **one bundle this runtime will execute**, already selected from however many
 * the release carries. Absent exactly when the component is prebuilt — such a component's code lives
 * in the consuming application, and the description is the whole of what the CMS published.
 */
interface PublishedComponent {
  publication: ComponentPublication
  executable?: PublishedExecutable
}

const ignoreUntilAwaited = (): void => {}

const isMark = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const initialMark = (minimumRegistrySequence: number | undefined): number => {
  if (minimumRegistrySequence === undefined) return 0
  if (!isMark(minimumRegistrySequence)) {
    throw new TypeError('minimumRegistrySequence must be a non-negative integer')
  }
  return minimumRegistrySequence
}

class Verifier {
  readonly #rootPublicKey: Uint8Array
  readonly #source: Source
  readonly #platforms: readonly string[]

  /** The highest manifest sequence seen, or the consumer's mark. See the note on rollback above. */
  #highWaterMark: number
  #registry: KeyRegistry | undefined
  #registryLoad: Promise<Verdict<KeyRegistry>> | undefined
  /** VFY-1: one resolution per key id and digest; one that rejects is dropped. */
  readonly #resolutions = new Map<string, Promise<ResolvedKey | string>>()

  constructor (options: VerifierOptions) {
    if (getAlgorithm(ROOT_ALGORITHM) === undefined) {
      throw new UnreachableError('root-algorithm-unavailable', `${ROOT_ALGORITHM} is not built in`)
    }
    this.#rootPublicKey = options.rootPublicKey
    this.#source = options.source
    this.#platforms = options.platforms ?? [WEB_ESMODULE]
    this.#highWaterMark = initialMark(options.minimumRegistrySequence)
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

    const verified = verifyEnvelope(candidate, KEY_REGISTRY_DOCUMENT, { alg: ROOT_ALGORITHM, publicKey: this.#rootPublicKey })
    if (!verified.valid) return { valid: false, reason: verified.reason }

    const registry = readRegistry(verified.payload)
    if (typeof registry === 'string') return { valid: false, reason: registry }

    if (registry.sequence < this.#highWaterMark) {
      return {
        valid: false,
        reason: `registry-rollback: sequence ${registry.sequence} is below ${this.#highWaterMark}`
      }
    }

    this.#highWaterMark = registry.sequence
    this.#registry = registry
    return { valid: true, value: registry }
  }

  /** The established registry, loading it on first use. Callers asking at once share one load. */
  async registry (): Promise<Verdict<KeyRegistry>> {
    if (this.#registry !== undefined) return { valid: true, value: this.#registry }
    this.#registryLoad ??= this.#loadRegistryOnce()
    return await this.#registryLoad
  }

  async #loadRegistryOnce (): Promise<Verdict<KeyRegistry>> {
    try {
      return await this.loadRegistry()
    } finally {
      this.#registryLoad = undefined
    }
  }

  /** VFY-1, REG-2 */
  async #keyFor (entry: RegistryKey): Promise<ResolvedKey | string> {
    const cacheKey = `${entry.keyId}:${entry.digest}`
    let resolution = this.#resolutions.get(cacheKey)
    if (resolution === undefined) {
      resolution = this.#resolveKeyFile(entry)
      this.#resolutions.set(cacheKey, resolution)
      resolution.catch(() => this.#resolutions.delete(cacheKey))
    }
    return await resolution
  }

  async #resolveKeyFile (entry: RegistryKey): Promise<ResolvedKey | string> {
    const candidate = await this.#readJSON(keyFilePath(entry.keyId))
    if (candidate === undefined) return `key-file-absent: ${entry.keyId}`
    return readKeyFile(entry, candidate)
  }

  #startLoadingRegistry (): void {
    this.registry().catch(ignoreUntilAwaited)
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

    const entry = registry.value.keys.find(key => key.keyId === header.keyId)
    if (entry === undefined || entry.revokedAt !== undefined) {
      return { valid: false, reason: `key-unresolvable: ${header.keyId} is unknown or revoked` }
    }
    const premature = rejectBeforeKey(candidate, expectedType, entry.alg)
    if (premature !== undefined) return { valid: false, reason: premature }

    const key = await this.#keyFor(entry)
    if (typeof key === 'string') return { valid: false, reason: key }

    const verified = verifyEnvelope(candidate, expectedType, key)
    if (!verified.valid) return { valid: false, reason: verified.reason }
    return { valid: true, value: verified.payload }
  }

  /**
   * A publication a node pinned: fetched, verified, read, checked against the pin, and resolved to
   * the bundle this runtime will run.
   *
   * **This is the whole component-resolution path**, and it is one method because a publication is
   * one document. It used to be three — a header fetch, an executable fetch, and a binding check
   * between them — and the binding check was the one nothing in the happy path exercised.
   *
   * Four things a valid signature does not settle are checked here, in this order:
   *
   * 1. **Is it shaped like a publication?** A signature attests to bytes, not to their shape, and
   *    whoever holds the signing key can sign a malformed payload. This is also where a prebuilt
   *    component carrying code, and a dynamic one carrying none, are refused.
   * 2. **Is it the publication the page pinned?** Whoever can write to storage can move a genuine,
   *    correctly signed older release onto the path a newer one occupies, and every signature stays
   *    valid.
   * 3. **Is it the kind the page said?** Stated in two documents signed at different times, so they
   *    can disagree — see `matchesPin`.
   * 4. **Can this runtime run it?** A release compiled only for other platforms is a correctly
   *    signed artifact meant for somebody else.
   *
   * `undefined` means nothing is published there — a page pinning a publication that was never
   * written, or has since been deleted. That is an ordinary answer and a different one from a
   * publication that failed to verify.
   */
  async component (
    pin: { uid: string, publicationId: string, type?: ComponentType }
  ): Promise<Verdict<PublishedComponent> | undefined> {
    const verified = await this.fetchVerified(
      publicationPath(pin.uid, pin.publicationId), PUBLICATION_DOCUMENT
    )
    if (verified === undefined) return undefined
    if (!verified.valid) return verified

    const read = readPublication(verified.value)
    if (!read.ok) return { valid: false, reason: read.reason }

    const pinned = matchesPin(read.value, pin)
    if (!pinned.ok) return { valid: false, reason: pinned.reason }

    const runnable = runnableOn(pinned.value, this.#platforms)
    if (!runnable.ok) return { valid: false, reason: runnable.reason }

    return {
      valid: true,
      value: {
        publication: pinned.value,
        // Omitted rather than set to undefined, so a prebuilt component's result has no such key —
        // `'executable' in value` is then the same question as "does this have code".
        ...(runnable.value === undefined ? {} : { executable: runnable.value })
      }
    }
  }


  /**
   * Fetches a path and verifies it as the document type the caller expects. The registry starts loading
   * alongside the fetch, so verifying does not wait for it afterwards.
   *
   * Throws if the object cannot be fetched; returns a verdict about it otherwise.
   */
  async fetchVerified (path: string, expectedType: string): Promise<Verdict<JsonValue> | undefined> {
    this.#startLoadingRegistry()
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
  Verifier, UnreachableError, REGISTRY_PATH, keyFilePath, pageTreePath, publicationPath, httpSource
}
export type { VerifierOptions, Verdict, Source, PublishedComponent }
