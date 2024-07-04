interface Config<AuthenticationExtension extends object = object,
    AuthorizationExtension extends object = object,
    DatabaseExtension extends object = object,
    DeploymentExtension extends object = object,
    StorageExtension extends object = object> {
  authentication: {
    adapterPath: string
  } & AuthenticationExtension
  authorization: {
    adapterPath: string
  } & AuthorizationExtension
  database: {
    adapterPath: string
  } & DatabaseExtension
  deployment: {
    adapterPath: string
  } & DeploymentExtension
  storage: {
    adapterPath: string
    defaultBucket: string
  } & StorageExtension
  collections: CollectionReference[]
  testDocuments?: [Document, Document]
  [key: string]: any
}

export default Config
