import { ROOT_ALGORITHM, getAlgorithm } from './algorithms.js'
import { peekUnverifiedHeader, verifyEnvelope } from './envelope.js'
import { KEY_REGISTRY_DOCUMENT, readRegistry, resolveKey, type KeyRegistry } from './registry.js'
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

interface VerifierOptions {
  /** Where the instance's storage is served from, e.g. `https://cdn.example.com`. */
  baseURL: string
  /** The instance's root public key: 32 bytes, embedded at build time. */
  rootPublicKey: Uint8Array
  /** Defaults to `fetch`. Supplied by tests, and by consumers with their own transport. */
  fetch?: typeof globalThis.fetch
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

class Verifier {
  readonly #baseURL: string
  readonly #rootPublicKey: Uint8Array
  readonly #fetch: typeof globalThis.fetch

  /** The highest registry sequence seen. See the note on rollback above. */
  #highWaterMark = 0
  #registry: KeyRegistry | undefined

  constructor (options: VerifierOptions) {
    if (getAlgorithm(ROOT_ALGORITHM) === undefined) {
      throw new UnreachableError('root-algorithm-unavailable', `${ROOT_ALGORITHM} is not built in`)
    }
    this.#baseURL = options.baseURL.replace(/\/+$/, '')
    this.#rootPublicKey = options.rootPublicKey
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  /** Fetches a path and parses it as JSON, distinguishing "not there" from "not JSON". */
  async #fetchJSON (path: string): Promise<unknown> {
    const response = await this.#fetch(`${this.#baseURL}/${path}`)
    if (!response.ok) {
      throw new UnreachableError('fetch-failed', `${path}: HTTP ${response.status}`)
    }
    try {
      return await response.json()
    } catch {
      // Not JSON at all is a transport-shaped failure: nothing was received that could be judged.
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
    const candidate = await this.#fetchJSON(REGISTRY_PATH)

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
   * Fetches a path and verifies it as the document type the caller expects.
   *
   * Throws if the object cannot be fetched; returns a verdict about it otherwise.
   */
  async fetchVerified (path: string, expectedType: string): Promise<Verdict<JsonValue>> {
    return await this.verifyDocument(await this.#fetchJSON(path), expectedType)
  }
}

export { Verifier, UnreachableError, REGISTRY_PATH }
export type { VerifierOptions, Verdict }
