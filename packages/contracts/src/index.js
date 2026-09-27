/**
 * Stamps the service kind onto an adapter descriptor.
 *
 * The kind is what lets the loader refuse a database adapter configured as storage with both names
 * in the message, rather than failing later on a missing method.
 *
 * @param {string} kind
 */
const stamp = (kind) => (descriptor) => Object.freeze({ ...descriptor, kind })

const defineStorageAdapter = stamp('storage')
const defineDatabaseAdapter = stamp('database')
const defineAuthenticationAdapter = stamp('authentication')
const defineSecretsAdapter = stamp('secrets')
const defineLanguageAdapter = stamp('language')
const defineDeploymentTarget = stamp('deployment')

/**
 * Identity functions. They exist for the types: a JavaScript adapter annotates nothing and still
 * gets its `create` checked against the service contract.
 */
const defineRuntime = (runtime) => runtime
const defineDeployProcedure = (procedure) => procedure

export {
  defineStorageAdapter,
  defineDatabaseAdapter,
  defineAuthenticationAdapter,
  defineSecretsAdapter,
  defineLanguageAdapter,
  defineDeploymentTarget,
  defineRuntime,
  defineDeployProcedure
}
