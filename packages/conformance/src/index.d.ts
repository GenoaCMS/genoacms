import type { Adapter as StorageAdapter } from '@genoacms/contracts/storage'
import type { Adapter as AuthenticationAdapter } from '@genoacms/contracts/authentication'
import type { Adapter as DatabaseAdapter, CollectionReference } from '@genoacms/contracts/database'

declare function runStorageConformance (adapter: StorageAdapter, fixture: { bucket: string }): void
declare function runDatabaseConformance (
  adapter: DatabaseAdapter,
  fixture: {
    collection: CollectionReference,
    /** A name unique to the run: every document the suite creates carries it in the field `run`. */
    prefix: string
  }
): void

interface AuthenticationFixtureIdentity { email: string, password: string, subject: string }
declare function runAuthenticationConformance (
  adapter: AuthenticationAdapter,
  fixture: { identity: AuthenticationFixtureIdentity, disabled?: AuthenticationFixtureIdentity },
  /** How many generated cases each property runs; default 50. */
  options?: { runs?: number }
): void

export { runStorageConformance, runDatabaseConformance, runAuthenticationConformance }
