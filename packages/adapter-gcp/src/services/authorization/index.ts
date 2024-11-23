import type { Adapter, AuthorizationProvider } from '@genoacms/cloudabstraction/authorization'
import config from '../../config.js'
import { ProjectsClient } from '@google-cloud/resource-manager'

const PROVIDER_NAME = '@genoacms/adapter-gcp/authorization'
const authorizationConfig = config.authorization.providers.find((provider: AuthorizationProvider) => provider.name === PROVIDER_NAME)
if (!authorizationConfig) throw new Error('authorization-provider-not-found')
const projectId = authorizationConfig.projectId
const resourceManager = new ProjectsClient({
  projectId,
  credentials: authorizationConfig.credentials
})

const isEmailAdmins: Adapter.isEmailAdmins = async (email: string) => {
  const resource = `projects/${projectId}`
  const role = resource + '/roles/genoacms'
  const data = await resourceManager.getIamPolicy({ resource })
  const policy = data[0]
  if ((policy.bindings) == null) throw new Error('no-bindings')
  const adminRole = policy.bindings.find(binding => binding.role === role)
  if (adminRole == null) throw new Error('no-admin-role')
  if (adminRole.members == null) throw new Error('no-principals')
  return adminRole.members.includes(`user:${email}`)
}

export {
  isEmailAdmins
}
