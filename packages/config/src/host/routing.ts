import type { CollectionReference } from '@genoacms/contracts/database'
import type { RuntimeManifest } from '../manifest.js'

/** Pure lookups over a manifest's config. Cheap, and the manifest is immutable, so nothing is cached. */

type HostConfig = RuntimeManifest['config']
type ConstructedService = 'storage' | 'database' | 'authentication' | 'languages'

const bucketProvider = (config: HostConfig, bucket: string): string | undefined =>
  Object.hasOwn(config.storage.buckets, bucket) ? config.storage.buckets[bucket].provider : undefined

/** The provider of the first database, in key order, declaring a collection with this name. */
function databaseProviderOfCollection (config: HostConfig, collection: string): string | undefined {
  const database = Object.values(config.database.databases)
    .find(candidate => candidate.collections.some(reference => reference.name === collection))
  return database?.provider
}

/** What a provider is responsible for: bucket names for storage, database names for a database. */
function resourcesOf (config: HostConfig, service: ConstructedService, provider: string): string[] {
  if (service === 'storage') return Object.keys(config.storage.buckets).filter(bucket => config.storage.buckets[bucket].provider === provider)
  if (service === 'database') return Object.keys(config.database.databases).filter(database => config.database.databases[database].provider === provider)
  return []
}

const bucketNames = (config: HostConfig): string[] => Object.keys(config.storage.buckets)
const databaseNames = (config: HostConfig): string[] => Object.keys(config.database.databases)
const collectionsOf = (config: HostConfig): CollectionReference[] =>
  Object.values(config.database.databases).flatMap(database => database.collections)

export { bucketProvider, databaseProviderOfCollection, resourcesOf, bucketNames, databaseNames, collectionsOf }
export type { HostConfig, ConstructedService }
