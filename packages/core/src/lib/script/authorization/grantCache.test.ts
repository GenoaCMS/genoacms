import { describe, it, expect, vi } from 'vitest'
import { GrantCache } from './grantCache'
import { createAuthContext } from './context'
import type { Resolution } from './resolution'
import { WILDCARD } from './grants'

const resolutionFor = (subject: string): Resolution => ({
  context: createAuthContext(subject, [{ permission: 'pages:publish', resource: WILDCARD }]),
  known: true,
  warnings: []
})

/** A resolver whose answer and call count the test controls. */
const controllable = () => {
  let answer = resolutionFor
  const resolve = vi.fn(async (subject: string) => answer(subject))
  return { resolve, setAnswer: (next: typeof answer) => { answer = next } }
}

describe('serving from cache', () => {
  it('resolves once and answers repeats from memory', async () => {
    const { resolve } = controllable()
    const cache = new GrantCache(resolve, { ttlSeconds: 30 })

    await cache.get('subject-1')
    await cache.get('subject-1')
    await cache.get('subject-1')

    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('keeps subjects apart', async () => {
    const { resolve } = controllable()
    const cache = new GrantCache(resolve, { ttlSeconds: 30 })

    expect((await cache.get('a')).context.subject).toBe('a')
    expect((await cache.get('b')).context.subject).toBe('b')
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('collapses concurrent requests for one subject into a single resolution', async () => {
    // Otherwise a burst of requests for one principal each reads the manifests.
    const { resolve } = controllable()
    const cache = new GrantCache(resolve, { ttlSeconds: 30 })
    await Promise.all([1, 2, 3, 4, 5].map(async () => await cache.get('subject-1')))
    expect(resolve).toHaveBeenCalledTimes(1)
  })
})

describe('the cache window is the revocation bound', () => {
  it('re-resolves once the window passes', async () => {
    let clock = 0
    const { resolve } = controllable()
    const cache = new GrantCache(resolve, { ttlSeconds: 30, now: () => clock })

    await cache.get('subject-1')
    clock += 29_000
    await cache.get('subject-1')
    expect(resolve).toHaveBeenCalledTimes(1)

    clock += 2_000
    await cache.get('subject-1')
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('picks up a permission removed elsewhere after the window', async () => {
    let clock = 0
    const source = controllable()
    const cache = new GrantCache(source.resolve, { ttlSeconds: 30, now: () => clock })

    expect((await cache.get('s')).context.grants).toHaveLength(1)
    source.setAnswer((subject) => ({ context: createAuthContext(subject, []), known: true, warnings: [] }))

    clock += 31_000
    expect((await cache.get('s')).context.grants).toHaveLength(0)
  })

  it('resolves every time when the window is zero', async () => {
    const { resolve } = controllable()
    const cache = new GrantCache(resolve, { ttlSeconds: 0 })

    await cache.get('subject-1')
    await cache.get('subject-1')
    expect(resolve).toHaveBeenCalledTimes(2)
  })
})

describe('invalidation', () => {
  it('forgets one subject', async () => {
    const { resolve } = controllable()
    const cache = new GrantCache(resolve, { ttlSeconds: 300 })

    await cache.get('a')
    await cache.get('b')
    cache.forget('a')
    await cache.get('a')
    await cache.get('b')

    expect(resolve).toHaveBeenCalledTimes(3)
  })

  it('clears everything, for a change to the roles themselves', async () => {
    const { resolve } = controllable()
    const cache = new GrantCache(resolve, { ttlSeconds: 300 })

    await cache.get('a')
    await cache.get('b')
    cache.clear()
    await cache.get('a')

    expect(resolve).toHaveBeenCalledTimes(3)
  })
})

describe('failure handling', () => {
  it('does not cache a failure, so a brief outage is not remembered as "no permissions"', async () => {
    let attempts = 0
    const resolve = vi.fn(async (subject: string) => {
      attempts++
      if (attempts === 1) throw new Error('bucket unreachable')
      return resolutionFor(subject)
    })
    const cache = new GrantCache(resolve, { ttlSeconds: 300 })

    await expect(cache.get('s')).rejects.toThrow('bucket unreachable')
    expect((await cache.get('s')).known).toBe(true)
  })

  it('propagates rather than reporting the subject unknown', async () => {
    // An outage is not a verdict. Reporting "no permissions" would deny a legitimate user.
    const resolve = vi.fn(async () => { throw new Error('bucket unreachable') })
    const cache = new GrantCache(resolve, { ttlSeconds: 30 })
    await expect(cache.get('s')).rejects.toThrow('bucket unreachable')
  })
})

describe('bounded size', () => {
  it('evicts rather than growing without limit', async () => {
    const { resolve } = controllable()
    const cache = new GrantCache(resolve, { ttlSeconds: 300, maxSubjects: 3 })

    for (const subject of ['a', 'b', 'c', 'd']) await cache.get(subject)
    // 'a' was evicted when 'd' arrived, so asking again re-resolves.
    await cache.get('a')
    expect(resolve).toHaveBeenCalledTimes(5)
  })
})
