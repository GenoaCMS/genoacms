import { findKey, isRevoked, type KeyManifest, type RegisteredKey } from './registry'
import { parseKeyFile } from './keyFile'
import type { VerificationKey } from './envelope'

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

type RegistryLoader = () => Promise<KeyManifest>

/** Reads a key file: `undefined` when none is stored, and throws when storage cannot answer. */
type KeyFileReader = (keyId: string) => Promise<unknown>

/** VFY-1 */
type KeyResolution =
  | { ok: true, key: VerificationKey }
  | { ok: false, reason: string }

const unresolvable = (keyId: string): KeyResolution =>
  ({ ok: false, reason: `key-unresolvable: ${keyId} is unknown or revoked` })

const usableEntry = (manifest: KeyManifest, keyId: string): RegisteredKey | undefined => {
  const entry = findKey(manifest, keyId)
  return entry === undefined || isRevoked(entry) ? undefined : entry
}

const resolutionKey = (entry: RegisteredKey): string => `${entry.keyId}:${entry.digest}`

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
  readonly #readKeyFile: KeyFileReader
  readonly #now: () => number
  readonly #missTtlMs: number
  readonly #maxMisses: number
  readonly #maxRefreshesPerWindow: number
  readonly #refreshWindowMs: number

  #cached: KeyManifest | undefined
  /** Shared so concurrent misses cause one read, not one each. */
  #inFlight: Promise<KeyManifest> | undefined
  /** VFY-1 */
  readonly #resolutions = new Map<string, Promise<KeyResolution>>()
  /** keyId -> when it was shown absent by a freshly loaded registry. */
  readonly #misses = new Map<string, number>()
  /** Timestamps of recent refreshes, pruned to the window. */
  #refreshes: number[] = []

  constructor (load: RegistryLoader, readKeyFile: KeyFileReader, options: KeyResolverOptions = {}) {
    this.#load = load
    this.#readKeyFile = readKeyFile
    this.#now = options.now ?? Date.now
    this.#missTtlMs = options.missTtlMs ?? DEFAULT_MISS_TTL_MS
    this.#maxMisses = options.maxMisses ?? DEFAULT_MAX_MISSES
    this.#maxRefreshesPerWindow = options.maxRefreshesPerWindow ?? DEFAULT_MAX_REFRESHES_PER_WINDOW
    this.#refreshWindowMs = options.refreshWindowMs ?? DEFAULT_REFRESH_WINDOW_MS
  }

  async #loadOnce (): Promise<KeyManifest> {
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
  async getRegistry (): Promise<KeyManifest> {
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

  async #resolveFile (entry: RegisteredKey): Promise<KeyResolution> {
    const candidate = await this.#readKeyFile(entry.keyId)
    if (candidate === undefined) return { ok: false, reason: `key-file-absent: ${entry.keyId}` }
    return parseKeyFile(entry, candidate)
  }

  /** VFY-1: one read per key and digest, a verdict remembered and a failure to read not. */
  async #keyFor (entry: RegisteredKey): Promise<KeyResolution> {
    const key = resolutionKey(entry)
    const remembered = this.#resolutions.get(key)
    if (remembered !== undefined) return await remembered
    const resolution = this.#resolveFile(entry)
    this.#resolutions.set(key, resolution)
    resolution.catch(() => { this.#resolutions.delete(key) })
    return await resolution
  }

  async #refreshedEntry (keyId: string): Promise<RegisteredKey | undefined> {
    if (this.#isKnownAbsent(keyId)) return undefined
    if (!this.#mayRefresh()) return undefined
    this.#refreshes.push(this.#now())
    const found = usableEntry(await this.#loadOnce(), keyId)
    if (found === undefined) this.#recordAbsent(keyId)
    return found
  }

  #forgetRevoked (manifest: KeyManifest): void {
    for (const entry of manifest.keys.filter(isRevoked)) this.#resolutions.delete(resolutionKey(entry))
  }

  /** VFY-1: the verification key for a `keyId`, re-reading the manifest once when it does not list it. */
  async resolve (keyId: string): Promise<KeyResolution> {
    const manifest = await this.getRegistry()
    this.#forgetRevoked(manifest)
    const known = usableEntry(manifest, keyId)
    if (known !== undefined) this.#misses.delete(keyId)
    const entry = known ?? await this.#refreshedEntry(keyId)
    if (entry === undefined) return unresolvable(keyId)
    return await this.#keyFor(entry)
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
  RegistryLoader,
  KeyFileReader,
  KeyResolution
}
