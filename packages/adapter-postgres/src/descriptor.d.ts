import type { AdapterDescriptor, Secret } from '@genoacms/contracts'

export interface PostgresDatabaseOptions {
  host: string
  port?: number
  database: string
  user: string
  password: Secret
}

declare module '@genoacms/contracts' {
  interface DatabaseAdapters { '@genoacms/adapter-postgres': PostgresDatabaseOptions }
}

declare const descriptor: AdapterDescriptor<'database', PostgresDatabaseOptions>
export default descriptor
