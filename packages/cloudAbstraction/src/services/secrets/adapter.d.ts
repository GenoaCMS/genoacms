export declare namespace Adapter {
  /** Resolves to `undefined` when the key does not exist, rather than rejecting. */
  type getSecret = (key: string) => Promise<string | undefined>
  type setSecret = (key: string, value: string) => Promise<boolean>
  /** Resolves to `false` when the key did not exist, so deletion is idempotent. */
  type deleteSecret = (key: string) => Promise<boolean>
}
