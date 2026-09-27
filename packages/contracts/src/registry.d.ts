/**
 * Adapter descriptor specifier → option type. Adapters extend these by module augmentation:
 *
 *   declare module '@genoacms/contracts' {
 *     interface StorageAdapters { '@genoacms/adapter-gcp/storage': GcpStorageOptions }
 *   }
 *
 * An unregistered specifier gets `Record<string, unknown>`: it configures, unchecked.
 */
interface StorageAdapters {}
interface DatabaseAdapters {}
interface AuthenticationAdapters {}
interface SecretsAdapters {}
interface LanguageAdapters {}
interface DeploymentTargets {}

type OptionsOf<R, S extends string> = S extends keyof R ? R[S] : Record<string, unknown>

export type { StorageAdapters, DatabaseAdapters, AuthenticationAdapters, SecretsAdapters, LanguageAdapters, DeploymentTargets, OptionsOf }
