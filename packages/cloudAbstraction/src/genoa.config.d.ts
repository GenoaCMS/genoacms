interface Config<AuthorizationExtension extends object = object,
    AuthenticationExtension extends object = object,
    DatabaseExtension extends object = object,
    DeploymentExtension extends object = object,
    StorageExtension extends object = object> {
  authorization: {
    adapterPath: string
  } & AuthorizationExtension
  authentication: {
    adapterPath: string
  } & AuthenticationExtension
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
