import type { Adapter } from '@genoacms/cloudabstraction/authorization'
import type { AuthorizationProvider } from '../../genoa.config.js'
import { getProvider } from '@genoacms/cloudabstraction'
import { ProjectsClient } from '@google-cloud/resource-manager'

const ADAPTER_PATH = '@genoacms/adapter-gcp/authorization'
const provider = getProvider('authorization', ADAPTER_PATH) as AuthorizationProvider
const projectId = provider.projectId
const resourceManager = new ProjectsClient({
  projectId,
  credentials: provider.credentials
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
