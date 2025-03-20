import type Adapter from './adapter.d'

type AuthorizationProvider<Extension extends object = object> = Extension & {
  name: string
  adapterPath: string
  adapter: Promise<typeof Adapter>
}

export type {
  Adapter,
  AuthorizationProvider
}
