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

export type {
  Adapter,
  SecretProvider
}
