import type { AdapterRuntime, SecretEncoding, Resolved } from '@genoacms/contracts'
import type { Adapter as StorageAdapter } from '@genoacms/contracts/storage'
import type { Adapter as DatabaseAdapter, CollectionReference } from '@genoacms/contracts/database'
import type { Adapter as AuthenticationAdapter } from '@genoacms/contracts/authentication'
import type { Adapter as SecretsAdapter } from '@genoacms/contracts/secrets'
import type { LanguageAdapter } from '@genoacms/internal/languageAdapter'
import type { AuthorizationConfig, ProviderEntry, SecurityConfig } from '../config.js'
import type { Manifest, RuntimeManifest } from '../manifest.js'
import { HostError } from './errors.js'
import { createSecretCache } from './secretCache.js'
import { createConstructionCache } from './constructions.js'
import { resolveOptions, type ResolveDeps } from './resolve.js'
import { bucketProvider, databaseProviderOfCollection, resourcesOf, bucketNames, databaseNames, collectionsOf, type ConstructedService, type HostConfig } from './routing.js'

type RuntimeLoader = (specifier: string) => Promise<{ default: AdapterRuntime<object, unknown> }>

interface HostOptions {
  manifest: RuntimeManifest | Manifest
  /** Injected by the caller: core passes `s => import(s)`, the CLI passes importFromProject. */
  load: RuntimeLoader
  /** Default: manifest.source?.root. */
  projectRoot?: string
  /** Deadline per getSecret call made while resolving options. Default 10_000. */
  secretTimeoutMs?: number
  /** Default: process.env. */
  environment?: Readonly<Record<string, string | undefined>>
}

interface Host {
  storage: (provider: string) => Promise<StorageAdapter>
  database: (provider: string) => Promise<DatabaseAdapter>
  authentication: (provider: string) => Promise<AuthenticationAdapter>
  language: (language: string) => Promise<LanguageAdapter>
  secrets: () => Promise<SecretsAdapter>

  storageForBucket: (bucket: string) => Promise<StorageAdapter>
  databaseForCollection: (collection: string) => Promise<DatabaseAdapter>
  /** Authentication provider keys, in config key order. Constructs nothing: `authentication(key)` does. */
  readonly authenticationProviderKeys: readonly string[]

  /** Read from the manifest on every access, never copied: authority is re-read. */
  readonly authorization: AuthorizationConfig
  readonly security: SecurityConfig
  readonly cookieName: string
  readonly defaultBucket: string
  /** `storage.pathDelimiter ?? '|->'`. */
  readonly pathDelimiter: string
  /** Bucket names in config key order. */
  readonly buckets: readonly string[]
  /** Database names in config key order. */
  readonly databases: readonly string[]
  /** Every collection of every database, databases in key order, collections in array order. */
  readonly collections: readonly CollectionReference[]

  /** Resolves one options object. Used by `genoa deploy` for target options. */
  resolve: <O extends object>(options: O, secretOptions: Readonly<Record<string, SecretEncoding>>, path: string) => Promise<Resolved<O>>
  /** Waits for pending constructions, then forgets every constructed provider. CLI only. */
  close: () => Promise<void>
}

const DEFAULT_SECRET_TIMEOUT_MS = 10_000
const DEFAULT_PATH_DELIMITER = '|->'

/** The message core has always given for an unknown language, listing what is configured. */
function languageNotConfigured (language: string, configured: string[]): HostError {
  const available = configured.length > 0
    ? `Configured languages: ${configured.join(', ')}.`
    : 'No language adapters are configured at all.'
  return new HostError('language/not-configured', `No language adapter is configured for '${language}'. ${available}`)
}

/**
 * The one object per process that holds constructed providers.
 *
 * Construction is cached by provider name and by nothing else, which is what makes two providers on
 * one adapter two instances. It performs no I/O until a provider is asked for.
 */
function createHost (options: HostOptions): Host {
  const { manifest, load } = options
  if (manifest.version !== 1) throw new HostError('host/unsupported-manifest', `manifest version ${String(manifest.version)} is not supported`)

  const config: HostConfig = manifest.config
  const projectRoot = options.projectRoot ?? manifest.source?.root
  const constructions = createConstructionCache()
  const secretCache = createSecretCache()
  const deps: ResolveDeps = {
    secrets: async () => await secrets(),
    environment: options.environment ?? process.env,
    cache: secretCache,
    timeoutMs: options.secretTimeoutMs ?? DEFAULT_SECRET_TIMEOUT_MS
  }

  const providersOf = (service: ConstructedService | 'secrets'): Record<string, ProviderEntry> =>
    config[service].providers as Record<string, ProviderEntry>

  async function instantiate<T> (entry: ProviderEntry, path: string, name: string, resources: string[], resolveDeps: ResolveDeps): Promise<T> {
    const record = manifest.adapters[entry.adapter]
    if (record?.runtime === undefined) throw new HostError('provider/unknown-adapter', `${path}.adapter: ${entry.adapter} is not in the manifest`)
    const resolved = await resolveOptions(entry.options as Record<string, unknown>, record.secretOptions, `${path}.options`, resolveDeps)
    const runtime = (await load(record.runtime)).default
    return await runtime.create(resolved, { name, resources, projectRoot }) as T
  }

  function construct<T> (service: ConstructedService, name: string): Promise<T> {
    return constructions.getOrCreate(`${service}:${name}`, async () => {
      const path = `${service}.providers.${name}`
      const entry = providersOf(service)[name]
      if (entry === undefined || !Object.hasOwn(providersOf(service), name)) throw new HostError('provider/not-found', path)
      return await instantiate<T>(entry, path, name, resourcesOf(config, service, name), deps)
    })
  }

  /** The store is built from env() and inline() only: a secret() here could never be resolved. */
  const refuseSecretReferences: ResolveDeps = {
    ...deps,
    secrets: async () => { throw new HostError('config/bootstrap-secret', 'the secrets provider cannot be configured with secret()') }
  }

  function secrets (): Promise<SecretsAdapter> {
    return constructions.getOrCreate('secrets', async () => {
      const names = Object.keys(providersOf('secrets'))
      if (names.length !== 1) throw new HostError('secrets/provider-count', `exactly one secrets provider is allowed, found ${names.length}`)
      const [name] = names
      return await instantiate<SecretsAdapter>(providersOf('secrets')[name], `secrets.providers.${name}`, name, [], refuseSecretReferences)
    })
  }

  async function language (name: string): Promise<LanguageAdapter> {
    const configured = Object.keys(providersOf('languages'))
    if (!configured.includes(name)) throw languageNotConfigured(name, configured)
    const adapter = await construct<LanguageAdapter>('languages', name)
    if (adapter.language !== name) {
      throw new HostError('language/mismatch', `languages.providers.${name} constructs an adapter for '${adapter.language}'`)
    }
    return adapter
  }

  async function storageForBucket (bucket: string): Promise<StorageAdapter> {
    const provider = bucketProvider(config, bucket)
    if (provider === undefined) throw new HostError('bucket/not-found', bucket)
    return await construct<StorageAdapter>('storage', provider)
  }

  async function databaseForCollection (collection: string): Promise<DatabaseAdapter> {
    const provider = databaseProviderOfCollection(config, collection)
    if (provider === undefined) throw new HostError('database/not-found', collection)
    return await construct<DatabaseAdapter>('database', provider)
  }

  return {
    storage: async provider => await construct<StorageAdapter>('storage', provider),
    database: async provider => await construct<DatabaseAdapter>('database', provider),
    authentication: async provider => await construct<AuthenticationAdapter>('authentication', provider),
    language,
    secrets,
    storageForBucket,
    databaseForCollection,
    get authenticationProviderKeys () { return Object.keys(providersOf('authentication')) },
    get authorization () { return config.authorization },
    get security () { return config.security },
    get cookieName () { return config.authentication.cookieName },
    get defaultBucket () { return config.storage.defaultBucket },
    get pathDelimiter () { return config.storage.pathDelimiter ?? DEFAULT_PATH_DELIMITER },
    get buckets () { return bucketNames(config) },
    get databases () { return databaseNames(config) },
    get collections () { return collectionsOf(config) },
    resolve: async <O extends object>(values: O, secretOptions: Readonly<Record<string, SecretEncoding>>, path: string) =>
      await resolveOptions(values as Record<string, unknown>, secretOptions, path, deps) as Resolved<O>,
    close: async () => {
      await Promise.allSettled(constructions.all())
      constructions.clear()
      secretCache.clear()
    }
  }
}

export { createHost, HostError }
export type { Host, HostOptions, RuntimeLoader }
