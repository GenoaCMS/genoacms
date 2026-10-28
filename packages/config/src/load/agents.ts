import type { ConfigIssue } from '../errors.js'
import { isPlainObject } from '../references.js'

interface AgentRuleContext {
  readonly config: Record<string, unknown>
}

const AGENT_SUBJECT = /^agent:[a-z0-9][a-z0-9-]{0,62}$/
const AGENT_PREFIX = 'agent:'
const CONFIGURATION_PERMISSION = /^config:/

const issue = (code: string, path: string, message: string): ConfigIssue => ({ code, path, message })

function declaredAgents (ctx: AgentRuleContext): string[] {
  const authentication = ctx.config.authentication
  if (!isPlainObject(authentication) || !isPlainObject(authentication.agents)) return []
  return Object.keys(authentication.agents)
}

function declaredRoles (ctx: AgentRuleContext): Record<string, unknown> {
  const authorization = ctx.config.authorization
  return isPlainObject(authorization) && isPlainObject(authorization.roles) ? authorization.roles : {}
}

function assignments (ctx: AgentRuleContext): Record<string, unknown> {
  const authorization = ctx.config.authorization
  return isPlainObject(authorization) && isPlainObject(authorization.assignments) ? authorization.assignments : {}
}

function exceedsCeiling (grants: unknown): boolean {
  if (!Array.isArray(grants)) return false
  return grants.some(grant => isPlainObject(grant) && typeof grant.permission === 'string' &&
    (grant.permission === '*' || CONFIGURATION_PERMISSION.test(grant.permission)))
}

// AGT-1
function subjectPrefixIssues (ctx: AgentRuleContext): ConfigIssue[] {
  return declaredAgents(ctx)
    .filter(subject => !AGENT_SUBJECT.test(subject))
    .map(subject => issue('authentication/agent-subject-prefix', `authentication.agents.${subject}`,
      `authentication/agent-subject-prefix: ${subject} must match agent:<name>, with a name of lowercase letters, digits and hyphens.`))
}

// AGT-5
function ceilingIssues (ctx: AgentRuleContext): ConfigIssue[] {
  const roles = declaredRoles(ctx)
  return Object.entries(assignments(ctx))
    .filter(([subject]) => subject.startsWith(AGENT_PREFIX))
    .flatMap(([subject, names]) => (Array.isArray(names) ? names : [])
      .filter(name => typeof name === 'string' && Object.hasOwn(roles, name) && exceedsCeiling(roles[name]))
      .map(name => issue('authorization/agent-ceiling', `authorization.assignments.${subject}`,
        `authorization/agent-ceiling: ${subject} is assigned ${String(name)}, which grants permissions an agent cannot hold.`)))
}

/** The rules of `agent-access.md` AGT-1 and AGT-5 that the config alone decides. */
function agentIssues (ctx: AgentRuleContext): ConfigIssue[] {
  return [...subjectPrefixIssues(ctx), ...ceilingIssues(ctx)]
}

/** Where a reference may stand: the token of each declared agent. */
function agentTokenPaths (ctx: AgentRuleContext): string[] {
  return declaredAgents(ctx).map(subject => `authentication.agents.${subject}.token`)
}

export { agentIssues, agentTokenPaths }
