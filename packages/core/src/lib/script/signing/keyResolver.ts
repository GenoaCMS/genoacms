import { findPublicKey, type KeyRegistry } from './registry'

/**
 * Resolving a `keyId` to the public key that verifies its signatures.
 *
 * The registry is held in memory, because otherwise every signature check would cost a storage read
 * and a root-signature verification. The invalidation rule is a **correctness** property rather than
 * a tuning choice: a key rotated on another node has to verify immediately, or artifacts that are
 * perfectly good get rejected in a way that looks exactly like tampering.
 *
 * So: cache, and **refresh when a `keyId` is not recognized**. A signature naming an unknown key is
 * itself the signal that a rotation happened elsewhere, which makes it the right moment to re-read.
 *
 * The loader is a constructor parameter so this policy can be exercised without a bucket.
 */

type RegistryLoader = () => Promise<KeyRegistry>

interface KeyResolverOptions {
  /** How long an id shown to be absent stays recorded as absent. */
  missTtlMs?: number
  /** Bound on the negative cache, so unlimited distinct ids cannot grow it without limit. */
  maxMisses?: number
  /** Refreshes permitted within `refreshWindowMs`. The backstop against unlimited distinct ids. */
  maxRefreshesPerWindow?: number
  refreshWindowMs?: number
  now?: () => number
}

const DEFAULT_MISS_TTL_MS = 60_000
const DEFAULT_MAX_MISSES = 1_024
const DEFAULT_MAX_REFRESHES_PER_WINDOW = 20
const DEFAULT_REFRESH_WINDOW_MS = 10_000

class KeyResolver {
  readonly #load: RegistryLoader
  readonly #now: () => number
  readonly #missTtlMs: number
  readonly #maxMisses: number
  readonly #maxRefreshesPerWindow: number
  readonly #refreshWindowMs: number

  #cached: KeyRegistry | undefined
  /** Shared so concurrent misses cause one read, not one each. */
  #inFlight: Promise<KeyRegistry> | undefined
  /** keyId -> when it was shown absent by a freshly loaded registry. */
  readonly #misses = new Map<string, number>()
  /** Timestamps of recent refreshes, pruned to the window. */
  #refreshes: number[] = []

  constructor (load: RegistryLoader, options: KeyResolverOptions = {}) {
    this.#load = load
    this.#now = options.now ?? Date.now
    this.#missTtlMs = options.missTtlMs ?? DEFAULT_MISS_TTL_MS
    this.#maxMisses = options.maxMisses ?? DEFAULT_MAX_MISSES
    this.#maxRefreshesPerWindow = options.maxRefreshesPerWindow ?? DEFAULT_MAX_REFRESHES_PER_WINDOW
    this.#refreshWindowMs = options.refreshWindowMs ?? DEFAULT_REFRESH_WINDOW_MS
  }

  async #loadOnce (): Promise<KeyRegistry> {
    if (this.#inFlight !== undefined) return await this.#inFlight
    this.#inFlight = this.#load()
      .then((registry) => {
        this.#cached = registry
        return registry
      })
      .finally(() => {
        this.#inFlight = undefined
      })
    return await this.#inFlight
  }

  /** The registry as currently held, loading it if this is the first call. */
  async getRegistry (): Promise<KeyRegistry> {
    if (this.#cached !== undefined) return this.#cached
    return await this.#loadOnce()
  }

  #isKnownAbsent (keyId: string): boolean {
    const recordedAt = this.#misses.get(keyId)
    if (recordedAt === undefined) return false
    if (this.#now() - recordedAt < this.#missTtlMs) return true
    // Expired. Publishing a key before anything signs with it should make a recorded absence
    // permanent and correct, but if that ordering is ever violated the expiry turns a key that
    // could never resolve into one that resolves late.
    this.#misses.delete(keyId)
    return false
  }

  #recordAbsent (keyId: string): void {
    if (this.#misses.size >= this.#maxMisses) {
      const oldest = this.#misses.keys().next()
      if (!(oldest.done ?? false)) this.#misses.delete(oldest.value)
    }
    this.#misses.set(keyId, this.#now())
  }

  #mayRefresh (): boolean {
    const cutoff = this.#now() - this.#refreshWindowMs
    this.#refreshes = this.#refreshes.filter(at => at > cutoff)
    return this.#refreshes.length < this.#maxRefreshesPerWindow
  }

  /**
   * The verification key for a `keyId`, re-reading once if the cached registry does not list it.
   *
   * `undefined` means the signature cannot be verified. It must never be read as "verified".
   */
  async resolve (keyId: string): Promise<Uint8Array | undefined> {
    const registry = await this.getRegistry()
    const known = findPublicKey(registry, keyId)
    if (known !== undefined) {
      this.#misses.delete(keyId)
      return known
    }

    // Repeats of an id already shown absent cost nothing. A *new* id is exactly what the first
    // signature after a rotation looks like, so it must still reach storage.
    if (this.#isKnownAbsent(keyId)) return undefined
    if (!this.#mayRefresh()) return undefined

    this.#refreshes.push(this.#now())
    const refreshed = await this.#loadOnce()
    const found = findPublicKey(refreshed, keyId)
    if (found === undefined) this.#recordAbsent(keyId)
    return found
  }

  /** Drops the cache, so the next read reloads. Called after this instance writes the registry. */
  invalidate (): void {
    this.#cached = undefined
    this.#misses.clear()
    this.#refreshes = []
  }
}

export {
  DEFAULT_MISS_TTL_MS,
  DEFAULT_MAX_MISSES,
  DEFAULT_MAX_REFRESHES_PER_WINDOW,
  DEFAULT_REFRESH_WINDOW_MS,
  KeyResolver
}

export type {
  KeyResolverOptions,
  RegistryLoader
}
