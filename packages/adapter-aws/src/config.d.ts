import type { genoaConfig } from '@genoacms/cloudabstraction'

interface Credentials {
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string
}

interface DatabaseExtension {
  region: string,
  credentials: Credentials
}

interface DeploymentExtension {
  region: string,
  credentials: Credentials,
  role: string
}

interface StorageExtension {
  region: string,
  credentials: Credentials,
  buckets: Array<string>,
  defaultBucket: string
}

type AWSConfig = genoaConfig<object, object, DatabaseExtension, DeploymentExtension, StorageExtension>

export default AWSConfig
