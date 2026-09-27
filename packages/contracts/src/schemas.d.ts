/** JSON Schema fragments for collection fields. Plain objects: they serialize into the manifest. */
declare const storageResource: Record<string, unknown>
declare const nullableStorageResource: Record<string, unknown>
declare function globalReference (options: { type?: string, format?: string }): Record<string, unknown>
declare function reference (options: { type?: string, format?: string, collection: string }): Record<string, unknown>

export { storageResource, nullableStorageResource, globalReference, reference }
