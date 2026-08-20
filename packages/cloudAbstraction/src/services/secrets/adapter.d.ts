export declare namespace Adapter {
  /** Resolves to `undefined` when the key does not exist, rather than rejecting. */
  type getSecret = (key: string) => Promise<string | undefined>
  type setSecret = (key: string, value: string) => Promise<boolean>
  /** Resolves to `false` when the key did not exist, so deletion is idempotent. */
  type deleteSecret = (key: string) => Promise<boolean>
  /**
   * Writes only if the key does not already exist, atomically.
   *
   * Resolves `true` for the caller that created it and `false` for every other. Two callers racing
   * must never both receive `true` — the operation exists so that instances starting concurrently
   * cannot each mint a root trust anchor and disagree about which one consumers should trust.
   *
   * A `false` result does not guarantee the key already holds a value: a provider that creates the
   * key and writes it in two calls can be interrupted between them. Callers must poll briefly and
   * then fail, never treat an empty result as "not configured".
   */
  type setSecretIfAbsent = (key: string, value: string) => Promise<boolean>
}
