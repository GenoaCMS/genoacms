/**
 * Type-level tests, checked by `tsc` (`pnpm run check`). A line after `@ts-expect-error` must fail to
 * compile; if it ever compiles, `tsc` reports the directive as unused and the check fails.
 */
import {
  defineSecretsAdapter,
  defineStorageAdapter,
  type Secret,
  type BootstrapSecret,
  type Resolved,
  type StorageAdapters,
  type OptionsOf,
  type SvelteKitAdapterFactory
} from '@genoacms/contracts'
import type { Adapter as AuthenticationAdapter } from '@genoacms/contracts/authentication'

declare module '@genoacms/contracts' {
  interface StorageAdapters { 'x/storage': { a: number } }
}

// 1. Resolved: an optional JSON credential resolves to its object type, still optional.
declare const resolved: Resolved<{ projectId: string, credentials?: Secret<{ private_key: string }> }>
export const privateKey: string | undefined = resolved.credentials?.private_key
export const projectId: string = resolved.projectId

// 2. A secrets adapter may take env() or inline() credentials.
defineSecretsAdapter<{ credentials?: BootstrapSecret<object>, n: number }>({ runtime: 'x' })

// 3. The bootstrap rule: a secrets adapter whose options accept secret() does not compile.
// @ts-expect-error
defineSecretsAdapter<{ token: Secret }>({ runtime: 'x' })

// 4. The same, nested.
// @ts-expect-error
defineSecretsAdapter<{ auth: { token: Secret } }>({ runtime: 'x' })

// 5. secretOptions keys are option names.
defineStorageAdapter<{ credentials?: Secret<object> }>({ runtime: 'x', secretOptions: { credentials: 'json' } })

// 6. An unknown secretOptions key does not compile.
// @ts-expect-error
defineStorageAdapter<{ credentials?: Secret<object> }>({ runtime: 'x', secretOptions: { credential: 'json' } })

// 7. The registry: augmentation types a specifier; an unregistered one accepts anything.
export const registered: OptionsOf<StorageAdapters, 'x/storage'> = { a: 1 }
// @ts-expect-error
export const wronglyTyped: OptionsOf<StorageAdapters, 'x/storage'> = { a: 'one' }
export const unregistered: OptionsOf<StorageAdapters, 'y'> = { anything: true }

// 8. The authentication instance interface merges with its namespace of method types.
export const authentication: AuthenticationAdapter = { authenticate: async () => null }
export const authenticate: AuthenticationAdapter.authenticate = authentication.authenticate

// 9. A real SvelteKit adapter, whose adapt takes SvelteKit's Builder, satisfies the factory type.
export const factory: SvelteKitAdapterFactory = () => ({ name: 'x', adapt: (builder: { log: () => void }) => { builder.log() } })
