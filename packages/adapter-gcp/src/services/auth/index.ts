import { ProjectsClient } from '@google-cloud/resource-manager'
import config from '../../config.js'
import type { isEmailAdmins as isEmailAdminsT } from '@genoacms/cloudabstraction/authorization'

const resourceManager = new ProjectsClient({
  projectId: config.authorization.projectId,
  credentials: config.authorization.credentials
})
const projectId = config.authorization.projectId

const isEmailAdmins: isEmailAdminsT = async (email: string) => {
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
