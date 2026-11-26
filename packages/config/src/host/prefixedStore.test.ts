import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { isValidSecretKey } from '@genoacms/contracts/secrets'
import type { Adapter as SecretsAdapter } from '@genoacms/contracts/secrets'
import { prefixedStore, storedSecretName, SECRETS_PREFIX_PATTERN } from './prefixedStore.js'

type Call = [method: keyof SecretsAdapter, ...args: string[]]

function recordingAdapter (answers: { get?: string, set?: boolean, setIfAbsent?: boolean, delete?: boolean } = {}) {
  const calls: Call[] = []
  const adapter: SecretsAdapter = {
    getSecret: async (key) => { calls.push(['getSecret', key]); return answers.get },
    setSecret: async (key, value) => { calls.push(['setSecret', key, value]); return answers.set ?? true },
    setSecretIfAbsent: async (key, value) => { calls.push(['setSecretIfAbsent', key, value]); return answers.setIfAbsent ?? true },
    deleteSecret: async (key) => { calls.push(['deleteSecret', key]); return answers.delete ?? true }
  }
  return { adapter, calls }
}

function rejectingAdapter (error: Error): SecretsAdapter {
  const reject = async (): Promise<never> => { throw error }
  return { getSecret: reject, setSecret: reject, setSecretIfAbsent: reject, deleteSecret: reject }
}

const prefixes = fc.oneof(
  fc.stringMatching(/^[A-Za-z][A-Za-z0-9]*(_[A-Za-z0-9]+)*$/),
  fc.array(fc.stringMatching(/^[AB]{1,2}$/), { minLength: 1, maxLength: 3 }).map(segments => segments.join('_'))
)
const plainKeys = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]*$/)
const keys = fc.oneof(
  plainKeys,
  fc.stringMatching(/^[AB_]{1,6}$/),
  plainKeys.map(key => `_${key}`),
  fc.tuple(plainKeys, plainKeys).map(([head, tail]) => `${head}__${tail}`),
  fc.tuple(prefixes, plainKeys).map(([head, tail]) => `${head}__${tail}`)
)
const segments = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]*$/)
const independentPairs = fc.tuple(fc.uniqueArray(prefixes, { minLength: 2, maxLength: 2 }), keys, keys)
  .map(([[p, q], k, l]) => [p, q, k, l] as const)
const extendedPrefixPairs = fc.tuple(prefixes, segments, keys, fc.constantFrom('_', '__'))
  .map(([p, segment, l, join]) => [p, `${p}_${segment}`, `${segment}${join}${l}`, l] as const)
const prefixPairsWithKeys = fc.oneof(independentPairs, extendedPrefixPairs)

describe('prefixedStore', () => {
  it('REF-9: each method calls the adapter with the prefixed key and passes the value unchanged', async () => {
    const { adapter, calls } = recordingAdapter()
    const store = prefixedStore(adapter, 'SHOP')
    await store.getSecret('A')
    await store.setSecret('A', 'v')
    await store.setSecretIfAbsent('A', 'v')
    await store.deleteSecret('A')
    expect(calls).toEqual([
      ['getSecret', 'SHOP__A'],
      ['setSecret', 'SHOP__A', 'v'],
      ['setSecretIfAbsent', 'SHOP__A', 'v'],
      ['deleteSecret', 'SHOP__A']
    ])
  })

  it("REF-9: each result and each rejection is the adapter's", async () => {
    const { adapter } = recordingAdapter({ get: undefined, set: false, setIfAbsent: true, delete: false })
    const store = prefixedStore(adapter, 'SHOP')
    expect(await store.getSecret('A')).toBeUndefined()
    expect(await store.setSecret('A', 'v')).toBe(false)
    expect(await store.setSecretIfAbsent('A', 'v')).toBe(true)
    expect(await store.deleteSecret('A')).toBe(false)

    const e = new Error('store down')
    const failing = prefixedStore(rejectingAdapter(e), 'SHOP')
    await expect(failing.getSecret('A')).rejects.toBe(e)
    await expect(failing.setSecret('A', 'v')).rejects.toBe(e)
    await expect(failing.setSecretIfAbsent('A', 'v')).rejects.toBe(e)
    await expect(failing.deleteSecret('A')).rejects.toBe(e)
  })

  it('REF-9: different prefixes never give one stored name', async () => {
    fc.assert(fc.property(prefixPairsWithKeys, ([p, q, k, l]) => {
      expect(SECRETS_PREFIX_PATTERN.test(p) && SECRETS_PREFIX_PATTERN.test(q)).toBe(true)
      expect(storedSecretName(p, k)).not.toBe(storedSecretName(q, l))
    }), { numRuns: 1000 })
  })

  it('REF-9: a stored name is a portable secret key', async () => {
    fc.assert(fc.property(prefixes, keys, (p, k) => {
      expect(isValidSecretKey(storedSecretName(p, k))).toBe(true)
    }), { numRuns: 1000 })
  })
})
