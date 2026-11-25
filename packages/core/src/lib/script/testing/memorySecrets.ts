import type { Parsed } from './requests'

interface MemorySecretsState { values: Map<string, string> }

const state: MemorySecretsState = ((globalThis as Parsed).__genoacmsMemorySecrets ??= { values: new Map() })
const { values } = state

/** The secrets providers module, backed by memory. */
const memorySecretsProviders = {
  getSecret: async (key: string): Promise<string | undefined> => values.get(key),
  setSecret: async (key: string, value: string): Promise<boolean> => {
    values.set(key, value)
    return true
  },
  deleteSecret: async (key: string): Promise<boolean> => {
    return values.delete(key)
  },
  setSecretIfAbsent: async (key: string, value: string): Promise<boolean> => {
    if (values.has(key)) return false
    values.set(key, value)
    return true
  },
  getOrClaimSecret: async (key: string, generate: () => string): Promise<{ value: string, claimed: boolean }> => {
    const existing = values.get(key)
    if (existing !== undefined) return { value: existing, claimed: false }
    const value = generate()
    values.set(key, value)
    return { value, claimed: true }
  }
}

/** What a test reads and arranges in the secrets service. */
const memorySecrets = {
  values,
  clear (): void {
    values.clear()
  },
  get (key: string): string | undefined {
    return values.get(key)
  },
  set (key: string, value: string): void {
    values.set(key, value)
  }
}

export { memorySecretsProviders, memorySecrets }
