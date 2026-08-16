import type { Adapter } from './adapter.d'

declare module '@genoacms/adapter-*/secrets' {
  import type { Adapter } from './adapter.d'

  const getSecret: Adapter.getSecret
  const setSecret: Adapter.setSecret
  const deleteSecret: Adapter.deleteSecret

  export {
    getSecret,
    setSecret,
    deleteSecret
  }
}

/**
 * A secret store backing this instance.
 *
 * Unlike storage and database, **exactly one provider is expected**. A secret store is a single
 * authority: with two configured, `setSecret` has no defensible answer to "written where?", and a
 * key present in one but not the other would make authorization depend on lookup order. The
 * service treats more than one as a configuration error rather than picking.
 */
type SecretProvider<Extension extends object = object> = Extension & {
  name: string
  adapterPath: string
  adapter: Promise<typeof Adapter>
}

/**
 * A pointer to a secret, used where `genoa.config` would otherwise carry the value itself.
 *
 * The wrapper object exists so that a configuration file can never be ambiguous about what it
 * holds: `{ secret: 'X' }` is unmistakably a reference, where a bare string would leave the reader
 * guessing whether `X` is the secret or its name — and guessing wrong in the safe direction means
 * committing a credential.
 */
interface SecretReference {
  secret: string
}

declare function isSecretReference (value: unknown): value is SecretReference

/**
 * The portable key rule every adapter enforces — the intersection of what the secret managers
 * accept, so a key valid in development stays valid in production.
 */
declare const SECRET_KEY_PATTERN: RegExp
declare function isValidSecretKey (key: string): boolean
declare function assertValidSecretKey (key: string): void

export {
  SECRET_KEY_PATTERN,
  isValidSecretKey,
  assertValidSecretKey,
  isSecretReference
}

export type {
  Adapter,
  SecretProvider,
  SecretReference
}
