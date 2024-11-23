import type { Adapter } from './adapter.d'

type AuthenticationProvider<Extension extends object = object> = Extension & {
  adapter: Promise<typeof Adapter>
}

export type {
  AuthenticationProvider
}
