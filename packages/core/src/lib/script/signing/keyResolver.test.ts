import { describe, it, expect, vi } from 'vitest'
import { KeyResolver, type RegistryLoader } from './keyResolver'
import { getAlgorithm, SUBORDINATE_ALGORITHM } from './algorithms'
import { deriveKeyId } from './keyId'
import { toBase64 } from './envelope'
import type { KeyRegistry } from './registry'

const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)

const makeKey = (fill: number) => {
  const keypair = algorithm.generateKeypair(new Uint8Array(algorithm.lengths.seed).fill(fill))
  return { keypair, keyId: deriveKeyId(keypair.publicKey) }
}

const first = makeKey(1)
const second = makeKey(2)

const registryOf = (...keys: Array<typeof first>): KeyRegistry => ({
  sequence: 1,
  current: keys[keys.length - 1].keyId,
  keys: keys.map(key => ({
    keyId: key.keyId,
    alg: SUBORDINATE_ALGORITHM,
    publicKey: toBase64(key.keypair.publicKey),
    createdAt: 1_000
  }))
})

/** A loader whose answer and call count the test controls. */
const controllableLoader = (initial: KeyRegistry) => {
  let registry = initial
  const load = vi.fn<RegistryLoader>(async () => registry)
  return { load, set: (next: KeyRegistry) => { registry = next } }
}

describe('serving from cache', () => {
  it('loads once and answers repeated lookups from memory', async () => {
    const { load } = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(load)

    await resolver.resolve(first.keyId)
    await resolver.resolve(first.keyId)
    await resolver.resolve(first.keyId)

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('returns the key that matches the id', async () => {
    const { load } = controllableLoader(registryOf(first, second))
    const resolver = new KeyResolver(load)
    expect(Array.from(await resolver.resolve(second.keyId) ?? []))
      .toEqual(Array.from(second.keypair.publicKey))
  })

  it('collapses concurrent first lookups into one load', async () => {
    const { load } = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(load)
    await Promise.all([1, 2, 3, 4, 5].map(async () => await resolver.resolve(first.keyId)))
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('picking up a rotation performed elsewhere', () => {
  it('re-reads immediately when a keyId is not in the cached registry', async () => {
    // The property the whole policy exists for, and the reason the limit is per id rather than a
    // global interval: this lookup must not be suppressed.
    const source = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(source.load)

    expect(await resolver.resolve(first.keyId)).toBeDefined()
    source.set(registryOf(first, second))

    expect(Array.from(await resolver.resolve(second.keyId) ?? []))
      .toEqual(Array.from(second.keypair.publicKey))
    expect(source.load).toHaveBeenCalledTimes(2)
  })

  it('picks up a rotation even immediately after other ids were shown absent', async () => {
    // A global interval between refreshes would have suppressed this: the unknown ids would have
    // started the clock, and the real key would have been rejected until it expired.
    const source = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(source.load)

    await resolver.resolve(first.keyId)
    await resolver.resolve('unknownaaaaaaaa1')
    await resolver.resolve('unknownaaaaaaaa2')
    source.set(registryOf(first, second))

    expect(await resolver.resolve(second.keyId)).toBeDefined()
  })

  it('serves the newly loaded key from cache afterwards', async () => {
    const source = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(source.load)

    await resolver.resolve(first.keyId)
    source.set(registryOf(first, second))
    await resolver.resolve(second.keyId)
    await resolver.resolve(second.keyId)

    expect(source.load).toHaveBeenCalledTimes(2)
  })
})

describe('the negative cache', () => {
  it('resolves an unknown id to undefined rather than throwing', async () => {
    // undefined must read as "cannot verify"; a caller treating it as verified accepts every forgery.
    const { load } = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(load)
    expect(await resolver.resolve('deadbeefdeadbeef')).toBeUndefined()
  })

  it('reads once for an unknown id and then answers repeats from memory', async () => {
    const { load } = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(load)

    await resolver.resolve(first.keyId)
    for (let attempt = 0; attempt < 20; attempt++) {
      await resolver.resolve('unknownaaaaaaaaa')
    }
    // One load for the registry, one refresh for the first sighting of the unknown id.
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('is not defeated by alternating between two unknown ids', async () => {
    const { load } = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(load)

    await resolver.resolve(first.keyId)
    for (let round = 0; round < 10; round++) {
      await resolver.resolve('unknownaaaaaaaa1')
      await resolver.resolve('unknownaaaaaaaa2')
    }
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('forgets an absence once it expires, so a late-published key can still resolve', async () => {
    let clock = 0
    const source = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(source.load, { missTtlMs: 1_000, now: () => clock })

    await resolver.resolve(second.keyId)
    source.set(registryOf(first, second))

    expect(await resolver.resolve(second.keyId)).toBeUndefined()
    clock += 1_500
    expect(await resolver.resolve(second.keyId)).toBeDefined()
  })

  it('does not grow without bound', async () => {
    const { load } = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(load, { maxMisses: 4, maxRefreshesPerWindow: 1_000 })

    for (let attempt = 0; attempt < 50; attempt++) {
      await resolver.resolve(`unknown${attempt}`)
    }
    // Nothing to assert on the private map directly; the budget test covers the cost, and this
    // confirms eviction does not break resolution.
    expect(await resolver.resolve(first.keyId)).toBeDefined()
  })
})

describe('the refresh budget', () => {
  it('caps reads driven by an unlimited supply of distinct unknown ids', async () => {
    // The per-id record cannot bound this on its own, since every id is new.
    const { load } = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(load, { maxRefreshesPerWindow: 5, refreshWindowMs: 10_000 })

    await resolver.resolve(first.keyId)
    for (let attempt = 0; attempt < 100; attempt++) {
      await resolver.resolve(`unknown${attempt}`)
    }
    expect(load).toHaveBeenCalledTimes(6)
  })

  it('recovers once the window passes', async () => {
    let clock = 0
    const { load } = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(load, { maxRefreshesPerWindow: 2, refreshWindowMs: 1_000, now: () => clock })

    await resolver.resolve(first.keyId)
    await resolver.resolve('unknownaaaaaaaa1')
    await resolver.resolve('unknownaaaaaaaa2')
    await resolver.resolve('unknownaaaaaaaa3')
    const duringWindow = load.mock.calls.length

    clock += 2_000
    await resolver.resolve('unknownaaaaaaaa4')

    expect(load.mock.calls.length).toBe(duringWindow + 1)
  })

  it('still serves known keys from cache while the budget is exhausted', async () => {
    // Exhausting the budget must degrade novelty handling, never ordinary verification.
    const { load } = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(load, { maxRefreshesPerWindow: 1 })

    await resolver.resolve(first.keyId)
    for (let attempt = 0; attempt < 20; attempt++) await resolver.resolve(`unknown${attempt}`)

    expect(await resolver.resolve(first.keyId)).toBeDefined()
  })
})

describe('invalidate', () => {
  it('forces the next lookup to reload', async () => {
    const { load } = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(load)

    await resolver.resolve(first.keyId)
    resolver.invalidate()
    await resolver.resolve(first.keyId)

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('clears recorded absences, so a rotation by this instance is seen at once', async () => {
    const source = controllableLoader(registryOf(first))
    const resolver = new KeyResolver(source.load, { missTtlMs: 60_000 })

    await resolver.resolve(second.keyId)
    source.set(registryOf(first, second))
    resolver.invalidate()

    expect(await resolver.resolve(second.keyId)).toBeDefined()
  })
})

describe('a failing load', () => {
  it('propagates rather than resolving to undefined', async () => {
    // Storage being unreachable is not the same as a key not existing, and collapsing the two would
    // turn an outage into a silent rejection of every signature.
    const load = vi.fn<RegistryLoader>(async () => { throw new Error('bucket unreachable') })
    const resolver = new KeyResolver(load)
    await expect(resolver.resolve(first.keyId)).rejects.toThrow('bucket unreachable')
  })

  it('does not cache the failure, so a later lookup retries', async () => {
    let attempts = 0
    const load = vi.fn<RegistryLoader>(async () => {
      attempts++
      if (attempts === 1) throw new Error('transient')
      return registryOf(first)
    })
    const resolver = new KeyResolver(load)

    await expect(resolver.resolve(first.keyId)).rejects.toThrow('transient')
    expect(await resolver.resolve(first.keyId)).toBeDefined()
  })
})
