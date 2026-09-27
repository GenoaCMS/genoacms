import type {
  OptionsOf,
  StorageAdapters,
  DatabaseAdapters,
  AuthenticationAdapters,
  SecretsAdapters,
  LanguageAdapters,
  DeploymentTargets
} from '@genoacms/contracts'
import type { ProviderEntry } from './config.js'

/**
 * One typed constructor per service, so an adapter's registered option type is looked up in the
 * right registry: the same specifier string may not mean the same options in two services.
 */
const entry = <S extends string, O> (adapter: S, options: O): ProviderEntry<S, O> => ({ adapter, options })

function storageProvider<S extends string> (adapter: S, options: OptionsOf<StorageAdapters, S>): ProviderEntry<S, OptionsOf<StorageAdapters, S>> {
  return entry(adapter, options)
}

function databaseProvider<S extends string> (adapter: S, options: OptionsOf<DatabaseAdapters, S>): ProviderEntry<S, OptionsOf<DatabaseAdapters, S>> {
  return entry(adapter, options)
}

function authenticationProvider<S extends string> (adapter: S, options: OptionsOf<AuthenticationAdapters, S>): ProviderEntry<S, OptionsOf<AuthenticationAdapters, S>> {
  return entry(adapter, options)
}

function secretsProvider<S extends string> (adapter: S, options: OptionsOf<SecretsAdapters, S>): ProviderEntry<S, OptionsOf<SecretsAdapters, S>> {
  return entry(adapter, options)
}

function languageProvider<S extends string> (adapter: S, options: OptionsOf<LanguageAdapters, S>): ProviderEntry<S, OptionsOf<LanguageAdapters, S>> {
  return entry(adapter, options)
}

function deploymentTarget<S extends string> (adapter: S, options: OptionsOf<DeploymentTargets, S>): ProviderEntry<S, OptionsOf<DeploymentTargets, S>> {
  return entry(adapter, options)
}

export { storageProvider, databaseProvider, authenticationProvider, secretsProvider, languageProvider, deploymentTarget }
