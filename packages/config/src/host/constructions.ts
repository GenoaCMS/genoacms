interface ConstructionCache {
  /** The cached promise for `key`, or `create()`'s, stored. A rejected promise is removed. */
  getOrCreate: <T>(key: string, create: () => Promise<T>) => Promise<T>
  all: () => Array<Promise<unknown>>
  clear: () => void
}

/**
 * Constructions keyed by provider, holding the **promise** rather than the instance: two callers
 * asking before the first construction settles must share it, not construct twice.
 */
function createConstructionCache (): ConstructionCache {
  const entries = new Map<string, Promise<unknown>>()
  return {
    getOrCreate<T> (key: string, create: () => Promise<T>): Promise<T> {
      const cached = entries.get(key)
      if (cached !== undefined) return cached as Promise<T>
      const creating = create()
      entries.set(key, creating)
      // Identity check: a late rejection must not delete a newer entry for the same key.
      creating.catch(() => { if (entries.get(key) === creating) entries.delete(key) })
      return creating
    },
    all: () => [...entries.values()],
    clear: () => { entries.clear() }
  }
}

export { createConstructionCache }
export type { ConstructionCache }
