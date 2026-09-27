interface SecretCache {
  /** One fetch per key per host. Concurrent callers share the promise; a rejected fetch is dropped. */
  get: (key: string, fetch: () => Promise<string | undefined>) => Promise<string | undefined>
  clear: () => void
}

/**
 * Resolved option secrets, for the life of the host.
 *
 * `undefined` is cached too: a key missing now stays missing until the process restarts, which is
 * the unit of rotation. A rejection is not, so a store that was briefly unreachable is asked again.
 */
function createSecretCache (): SecretCache {
  const entries = new Map<string, Promise<string | undefined>>()
  return {
    async get (key, fetch) {
      const cached = entries.get(key)
      if (cached !== undefined) return await cached
      const fetching = fetch()
      entries.set(key, fetching)
      fetching.catch(() => { if (entries.get(key) === fetching) entries.delete(key) })
      return await fetching
    },
    clear () { entries.clear() }
  }
}

export { createSecretCache }
export type { SecretCache }
