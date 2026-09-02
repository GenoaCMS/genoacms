import type { Resolution } from './resolution'

/**
 * Caching resolved grants per subject.
 *
 * Grants are not carried in the session token — the token holds identity only — so every request
 * needs them resolved. Reading both manifests on each request would put two storage reads in front
 * of every page, so the result is held per subject for a short window.
 *
 * **The window is a security parameter.** It is exactly how long a permission removed from a role
 * is still honored, which is why it belongs in the signed security policy rather than being tuned
 * by feel. It can be short, because a miss costs one resolution rather than a re-authentication.
 *
 * The resolver is a constructor parameter so this policy is testable without a bucket — the
 * assertions that matter are about *how many times* resolution happened.
 */

type SubjectResolver = (subject: string) => Promise<Resolution>

interface GrantCacheOptions {
  /** Seconds a resolution stays usable. Zero resolves every time, which is correct but costly. */
  ttlSeconds: number
  /** Bound on distinct subjects held, so a stream of unknown subjects cannot grow it without limit. */
  maxSubjects?: number
  now?: () => number
}

const DEFAULT_MAX_SUBJECTS = 1_000

interface CacheEntry {
  resolution: Resolution
  resolvedAt: number
}

class GrantCache {
  readonly #resolve: SubjectResolver
  readonly #ttlMs: number
  readonly #maxSubjects: number
  readonly #now: () => number
  readonly #entries = new Map<string, CacheEntry>()
  /** Shared per subject, so concurrent requests for one principal resolve once. */
  readonly #inFlight = new Map<string, Promise<Resolution>>()

  constructor (resolve: SubjectResolver, options: GrantCacheOptions) {
    this.#resolve = resolve
    this.#ttlMs = options.ttlSeconds * 1_000
    this.#maxSubjects = options.maxSubjects ?? DEFAULT_MAX_SUBJECTS
    this.#now = options.now ?? Date.now
  }

  #fresh (entry: CacheEntry): boolean {
    return this.#now() - entry.resolvedAt < this.#ttlMs
  }

  #remember (subject: string, resolution: Resolution): void {
    if (this.#entries.size >= this.#maxSubjects) {
      const oldest = this.#entries.keys().next()
      if (!(oldest.done ?? false)) this.#entries.delete(oldest.value)
    }
    this.#entries.set(subject, { resolution, resolvedAt: this.#now() })
  }

  /**
   * The resolution for a subject, from cache when fresh.
   *
   * A failed resolution is **not** cached. Storage being briefly unreachable would otherwise be
   * remembered as "this principal has no permissions" for the whole window, turning a momentary
   * outage into a spell of confusing denials.
   */
  async get (subject: string): Promise<Resolution> {
    const entry = this.#entries.get(subject)
    if (entry !== undefined && this.#fresh(entry)) return entry.resolution

    const existing = this.#inFlight.get(subject)
    if (existing !== undefined) return await existing

    const pending = this.#resolve(subject)
      .then((resolution) => {
        this.#remember(subject, resolution)
        return resolution
      })
      .finally(() => {
        this.#inFlight.delete(subject)
      })
    this.#inFlight.set(subject, pending)
    return await pending
  }

  /** Drops one subject, so a role change this instance made takes effect without waiting. */
  forget (subject: string): void {
    this.#entries.delete(subject)
  }

  /** Drops everything, for a change to the roles themselves rather than to one user. */
  clear (): void {
    this.#entries.clear()
  }
}

export {
  DEFAULT_MAX_SUBJECTS,
  GrantCache
}

export type {
  SubjectResolver,
  GrantCacheOptions
}
