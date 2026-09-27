import type { Adapter as StorageAdapter } from '@genoacms/contracts/storage'
import type { Adapter as DatabaseAdapter, CollectionReference, Document } from '@genoacms/contracts/database'

declare function runStorageConformance (adapter: StorageAdapter, fixture: { bucket: string }): void
declare function runDatabaseConformance (
  adapter: DatabaseAdapter,
  fixture: { collection: CollectionReference, testDocuments: [Document, Document] }
): void

export { runStorageConformance, runDatabaseConformance }
