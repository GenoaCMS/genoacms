import type Adapter from './adapter.d'

type AuthorizationProvider<Extension extends object = object> = Extension & {
  adapter: Promise<typeof Adapter>
}

export type {
  Adapter,
  AuthorizationProvider
}
