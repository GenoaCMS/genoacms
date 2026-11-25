import { describe, it, expect, vi } from 'vitest'
import { KeyResolver } from './keyResolver'
import { SUBORDINATE_ALGORITHM } from './algorithms'
import type { KeyManifest } from './registry'
import { subordinateKeypair, registeredKeyOf, keyFileOf, keyFilePathOf } from '#lib/script/testing/keyManifests.js'

type ManifestLoader = () => Promise<KeyManifest>
type KeyFileReader = (keyId: string) => Promise<unknown>

const makeKey = (fill: number) => {
  const keypair = subordinateKeypair(fill)
  return { keypair, keyId: registeredKeyOf(keypair.publicKey).keyId }
}

const first = makeKey(1)
const second = makeKey(2)

const manifestOf = (...keys: Array<typeof first>): KeyManifest => ({
  sequence: 1,
  current: keys[keys.length - 1].keyId,
  keys: keys.map(key => registeredKeyOf(key.keypair.publicKey)) as KeyManifest['keys']
})

const revoking = (manifest: KeyManifest, keyId: string): KeyManifest => ({
  ...manifest,
  sequence: manifest.sequence + 1,
  keys: manifest.keys.map(entry => entry.keyId === keyId ? { ...entry, revokedAt: 5_000 } : entry)
})

const resolved = (key: typeof first) => ({ ok: true, key: { alg: SUBORDINATE_ALGORITHM, publicKey: key.keypair.publicKey } })
const unresolvable = (keyId: string) => ({ ok: false, reason: `key-unresolvable: ${keyId} is unknown or revoked` })

/** A loader whose answer and call count the test controls. */
const controllableLoader = (initial: KeyManifest) => {
  let manifest = initial
  const load = vi.fn<ManifestLoader>(async () => manifest)
  return { load, set: (next: KeyManifest) => { manifest = next } }
}

/** The key files of every key, read by key id, as `readKeyFile` answers. */
const files = (...keys: Array<typeof first>) => {
  const stored = new Map<string, unknown>(keys.map(key => [key.keyId, keyFileOf(key.keypair.publicKey)]))
  const read = vi.fn<KeyFileReader>(async (keyId) => stored.get(keyId))
  return { read, stored }
}

const resolverOf = (load: ManifestLoader, read: KeyFileReader = files(first, second).read, options = {}) =>
  new KeyResolver(load, read, options)

describe('serving from cache', () => {
  it('loads once and answers repeated lookups from memory', async () => {
    const { load } = controllableLoader(manifestOf(first))
    const resolver = resolverOf(load)

    await resolver.resolve(first.keyId)
    await resolver.resolve(first.keyId)
    await resolver.resolve(first.keyId)

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('returns the key that matches the id', async () => {
    const { load } = controllableLoader(manifestOf(first, second))
    const resolver = resolverOf(load)
    expect(await resolver.resolve(second.keyId)).toEqual(resolved(second))
  })

  it('collapses concurrent first lookups into one load', async () => {
    const { load } = controllableLoader(manifestOf(first))
    const resolver = resolverOf(load)
    await Promise.all([1, 2, 3, 4, 5].map(async () => await resolver.resolve(first.keyId)))
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('picking up a rotation performed elsewhere', () => {
  it('re-reads immediately when a keyId is not in the cached manifest', async () => {
    const source = controllableLoader(manifestOf(first))
    const resolver = resolverOf(source.load)

    expect(await resolver.resolve(first.keyId)).toEqual(resolved(first))
    source.set(manifestOf(first, second))

    expect(await resolver.resolve(second.keyId)).toEqual(resolved(second))
    expect(source.load).toHaveBeenCalledTimes(2)
  })

  it('picks up a rotation even immediately after other ids were shown absent', async () => {
    const source = controllableLoader(manifestOf(first))
    const resolver = resolverOf(source.load)

    await resolver.resolve(first.keyId)
    await resolver.resolve('unknownaaaaaaaa1')
    await resolver.resolve('unknownaaaaaaaa2')
    source.set(manifestOf(first, second))

    expect(await resolver.resolve(second.keyId)).toEqual(resolved(second))
  })

  it('serves the newly loaded key from cache afterwards', async () => {
    const source = controllableLoader(manifestOf(first))
    const resolver = resolverOf(source.load)

    await resolver.resolve(first.keyId)
    source.set(manifestOf(first, second))
    await resolver.resolve(second.keyId)
    await resolver.resolve(second.keyId)

    expect(source.load).toHaveBeenCalledTimes(2)
  })
})

describe('the negative cache', () => {
  it('resolves an unknown id to a refusal rather than throwing', async () => {
    const { load } = controllableLoader(manifestOf(first))
    const resolver = resolverOf(load)
    expect(await resolver.resolve('deadbeefdeadbeef')).toEqual(unresolvable('deadbeefdeadbeef'))
  })

  it('reads once for an unknown id and then answers repeats from memory', async () => {
    const { load } = controllableLoader(manifestOf(first))
    const resolver = resolverOf(load)

    await resolver.resolve(first.keyId)
    for (let attempt = 0; attempt < 20; attempt++) {
      await resolver.resolve('unknownaaaaaaaaa')
    }
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('is not defeated by alternating between two unknown ids', async () => {
    const { load } = controllableLoader(manifestOf(first))
    const resolver = resolverOf(load)

    await resolver.resolve(first.keyId)
    for (let round = 0; round < 10; round++) {
      await resolver.resolve('unknownaaaaaaaa1')
      await resolver.resolve('unknownaaaaaaaa2')
    }
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('forgets an absence once it expires, so a late-published key can still resolve', async () => {
    let clock = 0
    const source = controllableLoader(manifestOf(first))
    const resolver = resolverOf(source.load, files(first, second).read, { missTtlMs: 1_000, now: () => clock })

    await resolver.resolve(second.keyId)
    source.set(manifestOf(first, second))

    expect(await resolver.resolve(second.keyId)).toEqual(unresolvable(second.keyId))
    clock += 1_500
    expect(await resolver.resolve(second.keyId)).toEqual(resolved(second))
  })

  it('does not grow without bound', async () => {
    const { load } = controllableLoader(manifestOf(first))
    const resolver = resolverOf(load, files(first).read, { maxMisses: 4, maxRefreshesPerWindow: 1_000 })

    for (let attempt = 0; attempt < 50; attempt++) {
      await resolver.resolve(`unknown${attempt}`)
    }
    expect(await resolver.resolve(first.keyId)).toEqual(resolved(first))
  })
})

describe('the refresh budget', () => {
  it('caps reads driven by an unlimited supply of distinct unknown ids', async () => {
    const { load } = controllableLoader(manifestOf(first))
    const resolver = resolverOf(load, files(first).read, { maxRefreshesPerWindow: 5, refreshWindowMs: 10_000 })

    await resolver.resolve(first.keyId)
    for (let attempt = 0; attempt < 100; attempt++) {
      await resolver.resolve(`unknown${attempt}`)
    }
    expect(load).toHaveBeenCalledTimes(6)
  })

  it('recovers once the window passes', async () => {
    let clock = 0
    const { load } = controllableLoader(manifestOf(first))
    const resolver = resolverOf(load, files(first).read, { maxRefreshesPerWindow: 2, refreshWindowMs: 1_000, now: () => clock })

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
    const { load } = controllableLoader(manifestOf(first))
    const resolver = resolverOf(load, files(first).read, { maxRefreshesPerWindow: 1 })

    await resolver.resolve(first.keyId)
    for (let attempt = 0; attempt < 20; attempt++) await resolver.resolve(`unknown${attempt}`)

    expect(await resolver.resolve(first.keyId)).toEqual(resolved(first))
  })
})

describe('invalidate', () => {
  it('forces the next lookup to reload', async () => {
    const { load } = controllableLoader(manifestOf(first))
    const resolver = resolverOf(load)

    await resolver.resolve(first.keyId)
    resolver.invalidate()
    await resolver.resolve(first.keyId)

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('clears recorded absences, so a rotation by this instance is seen at once', async () => {
    const source = controllableLoader(manifestOf(first))
    const resolver = resolverOf(source.load, files(first, second).read, { missTtlMs: 60_000 })

    await resolver.resolve(second.keyId)
    source.set(manifestOf(first, second))
    resolver.invalidate()

    expect(await resolver.resolve(second.keyId)).toEqual(resolved(second))
  })
})

describe('a failing load', () => {
  it('propagates rather than resolving to a refusal', async () => {
    const load = vi.fn<ManifestLoader>(async () => { throw new Error('bucket unreachable') })
    const resolver = resolverOf(load)
    await expect(resolver.resolve(first.keyId)).rejects.toThrow('bucket unreachable')
  })

  it('does not cache the failure, so a later lookup retries', async () => {
    let attempts = 0
    const load = vi.fn<ManifestLoader>(async () => {
      attempts++
      if (attempts === 1) throw new Error('transient')
      return manifestOf(first)
    })
    const resolver = resolverOf(load)

    await expect(resolver.resolve(first.keyId)).rejects.toThrow('transient')
    expect(await resolver.resolve(first.keyId)).toEqual(resolved(first))
  })
})

describe('the key files', () => {
  it('VFY-1: a listed key\'s file is read once, and its resolution remembered', async () => {
    const { load } = controllableLoader(manifestOf(first))
    const { read } = files(first)
    const resolver = resolverOf(load, read)

    const answers = await Promise.all([1, 2, 3].map(async () => await resolver.resolve(first.keyId)))
    answers.push(await resolver.resolve(first.keyId))

    expect(answers).toEqual(Array(4).fill(resolved(first)))
    expect(read.mock.calls).toEqual([[first.keyId]])
  })

  it('VFY-1: a revoked key is refused without reading its file', async () => {
    const { load } = controllableLoader(revoking(manifestOf(first, second), first.keyId))
    const { read } = files(first, second)
    const resolver = resolverOf(load, read)

    expect(await resolver.resolve(first.keyId)).toEqual(unresolvable(first.keyId))
    expect(read).not.toHaveBeenCalled()
  })

  it('VFY-1: an absent key file is the verdict key-file-absent', async () => {
    const { load } = controllableLoader(manifestOf(first))
    const resolver = resolverOf(load, vi.fn<KeyFileReader>(async () => undefined))

    expect(await resolver.resolve(first.keyId)).toEqual({ ok: false, reason: `key-file-absent: ${first.keyId}` })
  })

  it('VFY-1: a key file that does not match its entry is refused, and the refusal remembered', async () => {
    const { load } = controllableLoader(manifestOf(first))
    const { read, stored } = files(first)
    stored.set(first.keyId, { ...keyFileOf(second.keypair.publicKey), keyId: first.keyId })
    const resolver = resolverOf(load, read)
    const refusal = { ok: false, reason: `key-file-mismatch: ${first.keyId} publicKey does not match the key manifest` }

    expect(await resolver.resolve(first.keyId)).toEqual(refusal)
    expect(await resolver.resolve(first.keyId)).toEqual(refusal)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('VFY-1: a key file read that throws is not remembered, and propagates', async () => {
    const { load } = controllableLoader(manifestOf(first))
    const { read } = files(first)
    read.mockImplementationOnce(async () => { throw new Error(`storage down at ${keyFilePathOf(first.keyId)}`) })
    const resolver = resolverOf(load, read)

    await expect(resolver.resolve(first.keyId)).rejects.toThrow('storage down')
    expect(await resolver.resolve(first.keyId)).toEqual(resolved(first))
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('VFY-1: a manifest that revokes a key drops its remembered resolution', async () => {
    const source = controllableLoader(manifestOf(first, second))
    const resolver = resolverOf(source.load)

    expect(await resolver.resolve(first.keyId)).toEqual(resolved(first))
    source.set(revoking(manifestOf(first, second), first.keyId))
    resolver.invalidate()

    expect(await resolver.resolve(first.keyId)).toEqual(unresolvable(first.keyId))
  })
})
