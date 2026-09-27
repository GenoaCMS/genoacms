import type { AdapterDescriptor, AdapterRuntime, DeploymentDescriptor, DeployProcedure } from './adapter.js'
import type { ContainsSecretRef } from './references.js'
import type { Adapter as StorageAdapter } from './storage/index.js'
import type { Adapter as DatabaseAdapter } from './database/index.js'
import type { Adapter as AuthenticationAdapter } from './authentication/index.js'
import type { Adapter as SecretsAdapter } from './secrets/index.js'
import type { LanguageAdapter } from '@genoacms/internal/languageAdapter'

/** Makes a secrets adapter whose options accept `secret()` fail to compile: the bootstrap rule. */
type BootstrapGuard<O> = ContainsSecretRef<O> extends true
  ? { readonly 'secrets adapter options may not accept secret()': never }
  : unknown

declare function defineStorageAdapter<O extends object> (d: Omit<AdapterDescriptor<'storage', O>, 'kind'>): AdapterDescriptor<'storage', O>
declare function defineDatabaseAdapter<O extends object> (d: Omit<AdapterDescriptor<'database', O>, 'kind'>): AdapterDescriptor<'database', O>
declare function defineAuthenticationAdapter<O extends object> (d: Omit<AdapterDescriptor<'authentication', O>, 'kind'>): AdapterDescriptor<'authentication', O>
declare function defineSecretsAdapter<O extends object> (d: Omit<AdapterDescriptor<'secrets', O>, 'kind'> & BootstrapGuard<O>): AdapterDescriptor<'secrets', O>
declare function defineLanguageAdapter<O extends object> (d: Omit<AdapterDescriptor<'language', O>, 'kind'>): AdapterDescriptor<'language', O>
declare function defineDeploymentTarget<O extends object> (d: Omit<DeploymentDescriptor<O>, 'kind'>): DeploymentDescriptor<O>

declare function defineRuntime<O extends object, I> (runtime: AdapterRuntime<O, I>): AdapterRuntime<O, I>
declare function defineDeployProcedure<O extends object> (procedure: DeployProcedure<O>): DeployProcedure<O>

export {
  defineStorageAdapter,
  defineDatabaseAdapter,
  defineAuthenticationAdapter,
  defineSecretsAdapter,
  defineLanguageAdapter,
  defineDeploymentTarget,
  defineRuntime,
  defineDeployProcedure
}
export type * from './references.js'
export type * from './adapter.js'
export type * from './registry.js'
export type { StorageAdapter, DatabaseAdapter, AuthenticationAdapter, SecretsAdapter, LanguageAdapter }
