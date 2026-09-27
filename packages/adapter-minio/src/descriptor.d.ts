import type { AdapterDescriptor, Secret } from '@genoacms/contracts'

export interface MinioStorageOptions {
  endPoint: string
  port?: number
  useSSL?: boolean
  region?: string
  accessKey: Secret
  secretKey: Secret
}

declare module '@genoacms/contracts' {
  interface StorageAdapters { '@genoacms/adapter-minio': MinioStorageOptions }
}

declare const descriptor: AdapterDescriptor<'storage', MinioStorageOptions>
export default descriptor
