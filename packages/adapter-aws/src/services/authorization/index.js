/**
 * @typedef {import('@genoacms/cloudabstraction/authorization').Adapter} Adapter
 */

import { IAMClient, ListGroupsForUserCommand } from '@aws-sdk/client-iam'
import { config } from '@genoacms/cloudabstraction'

const iamClient = new IAMClient({
  region: config.authorization.region,
  credentials: config.authorization.credentials
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
