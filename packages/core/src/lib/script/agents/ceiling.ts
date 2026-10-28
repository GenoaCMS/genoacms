import { WILDCARD, type Grant } from '$lib/script/authorization/grants'

const AGENT_PREFIX = 'agent:'
const AGENT_SUBJECT = /^agent:[a-z0-9][a-z0-9-]{0,62}$/
const CONFIGURATION_PERMISSION = /^config:/

/** AGT-4 */
const isAgentSubject = (subject: string): boolean => subject.startsWith(AGENT_PREFIX)

/** AGT-1, AGT-3 */
const isValidAgentSubject = (subject: string): boolean => AGENT_SUBJECT.test(subject)

/** AGT-5: a configuration permission, or the wildcard. */
const exceedsAgentCeiling = (grants: Grant[]): boolean =>
  grants.some(grant => grant.permission === WILDCARD || CONFIGURATION_PERMISSION.test(grant.permission))

const ceilingMessage = (subject: string, role: string): string =>
  `authorization/agent-ceiling: ${subject} is assigned ${role}, which grants permissions an agent cannot hold.`

/** AGT-5 */
class AgentCeilingError extends Error {
  constructor (readonly subject: string, readonly role: string) {
    super(ceilingMessage(subject, role))
    this.name = 'AgentCeilingError'
  }
}

export { isAgentSubject, isValidAgentSubject, exceedsAgentCeiling, ceilingMessage, AgentCeilingError }
