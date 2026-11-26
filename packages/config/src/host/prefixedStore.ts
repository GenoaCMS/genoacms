import type { Adapter as SecretsAdapter } from '@genoacms/contracts/secrets'

/** LDR-22: a letter first, no `__`, no trailing `_`. */
const SECRETS_PREFIX_PATTERN = /^[A-Za-z][A-Za-z0-9]*(_[A-Za-z0-9]+)*$/

/** The name a key is stored under for an instance prefix (REF-9). */
function storedSecretName (prefix: string, key: string): string {
  return `${prefix}__${key}`
}

/** REF-9, SD8 */
function prefixedStore (adapter: SecretsAdapter, prefix: string): SecretsAdapter {
  const stored = (key: string): string => storedSecretName(prefix, key)
  return {
    getSecret: async key => await adapter.getSecret(stored(key)),
    setSecret: async (key, value) => await adapter.setSecret(stored(key), value),
    setSecretIfAbsent: async (key, value) => await adapter.setSecretIfAbsent(stored(key), value),
    deleteSecret: async key => await adapter.deleteSecret(stored(key))
  }
}

export { SECRETS_PREFIX_PATTERN, storedSecretName, prefixedStore }
