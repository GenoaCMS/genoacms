/**
 * @typedef {import('@genoacms/cloudabstraction/authentication').Adapter} Adapter
 */

import { IAMClient, ListGroupsForUserCommand } from '@aws-sdk/client-iam'
import { config } from '@genoacms/cloudabstraction'

const iamClient = new IAMClient({
  region: config.authentication.region,
  credentials: config.authentication.credentials
})

/**
  * @type {Adapter.isEmailAdmins}
  */
async function isEmailAdmins (name) {
  const command = new ListGroupsForUserCommand({ UserName: name, MaxItems: 10 })
  const response = await iamClient.send(command)

  for (const group of response.Groups) {
    if (group.GroupName === 'genoacms') return true
  }
  return false
}

export {
  isEmailAdmins
}
