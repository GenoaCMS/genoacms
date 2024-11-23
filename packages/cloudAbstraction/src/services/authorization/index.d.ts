type AuthorizationProvider<Extension extends object = object> = Extension & {
  adapter: Promise<typeof Adapter>
}

export type {
  AuthorizationProvider
}
