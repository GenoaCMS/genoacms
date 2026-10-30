import { host } from '#lib/script/host.server.js'
import { requirePermission } from '#lib/script/authorization/enforce.js'
import type { AuthContext } from '#lib/script/authorization/context.js'
import { forgetSubject } from '#lib/script/authorization/grants.server.js'
import { loadAuthorizationSource } from '#lib/script/authorization/resolution.server.js'
import type { Role } from '#lib/script/authorization/roles.js'
import { readStoredAgentsForAdministration, writeStoredAgents } from './manifest.server'
import type { AgentRecord } from './manifest'
import { AgentCeilingError, exceedsAgentCeiling } from './ceiling'
import { generateAgentToken, hashAgentToken } from './tokens'

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/

const subjectOf = (name: string): string => `agent:${name}`

const isDeclared = (subject: string): boolean => Object.hasOwn(host.agents, subject)

function requireValidName (name: string): string {
  if (!NAME.test(name)) throw new Error(`agents/invalid-name: ${name} must match ${NAME.source}.`)
  return subjectOf(name)
}

function requireUnclaimed (subject: string, stored: AgentRecord[]): void {
  if (isDeclared(subject) || stored.some(agent => agent.subject === subject)) throw new Error(`agents/exists: ${subject} already exists.`)
}

function requireStored (subject: string, stored: AgentRecord[]): AgentRecord {
  if (isDeclared(subject)) throw new Error(`agents/declared: ${subject} is declared in genoa.config.`)
  const agent = stored.find(candidate => candidate.subject === subject)
  if (agent === undefined) throw new Error(`agents/not-found: ${subject} does not exist.`)
  return agent
}

async function requireAssignableRoles (subject: string, names: string[]): Promise<void> {
  const { source } = await loadAuthorizationSource()
  const known = new Map<string, Role>((source.available ? source.roles : []).map(role => [role.name, role]))
  const unknown = names.filter(name => !known.has(name))
  if (unknown.length > 0) throw new Error(`user/unknown-roles: ${unknown.join(', ')}`)
  const exceeding = names.find(name => exceedsAgentCeiling((known.get(name) as Role).grants))
  if (exceeding !== undefined) throw new AgentCeilingError(subject, exceeding)
}

function requireAdministrator (ctx: AuthContext): void {
  requirePermission(ctx, 'config:users:manage')
}

interface AgentListing {
  subject: string
  label: string
  roles: string[]
  declared: boolean
}

/** AGT-3: every agent, declared and stored. */
async function listAgents (ctx: AuthContext): Promise<AgentListing[]> {
  requireAdministrator(ctx)
  const assignments = host.authorization.assignments ?? {}
  const declared = Object.entries(host.agents).map(([subject, entry]) =>
    ({ subject, label: entry.label, roles: assignments[subject] ?? [], declared: true }))
  const { agents } = await readStoredAgentsForAdministration()
  return [...declared, ...agents.map(agent => ({ subject: agent.subject, label: agent.label, roles: agent.roles, declared: false }))]
}

/** AGT-3: a stored agent and its first token, which is returned once and never stored. */
async function createAgent (
  ctx: AuthContext,
  input: { name: string, label: string, roles: string[] }
): Promise<{ subject: string, token: string }> {
  requireAdministrator(ctx)
  const subject = requireValidName(input.name)
  await requireAssignableRoles(subject, input.roles)
  const { agents, version } = await readStoredAgentsForAdministration()
  requireUnclaimed(subject, agents)
  const token = generateAgentToken()
  const record: AgentRecord = { subject, label: input.label, tokenHash: hashAgentToken(token), roles: input.roles, createdAt: Date.now(), createdBy: ctx.subject }
  await writeStoredAgents([...agents, record], version)
  await forgetSubject(subject)
  return { subject, token }
}

/** AGT-3: the previous token stops working. */
async function reissueAgentToken (ctx: AuthContext, subject: string): Promise<{ token: string }> {
  requireAdministrator(ctx)
  const { agents, version } = await readStoredAgentsForAdministration()
  requireStored(subject, agents)
  const token = generateAgentToken()
  await writeStoredAgents(agents.map(agent => agent.subject === subject ? { ...agent, tokenHash: hashAgentToken(token) } : agent), version)
  return { token }
}

/** AGT-3, AGT-5 */
async function updateAgent (ctx: AuthContext, subject: string, input: { label: string, roles: string[] }): Promise<void> {
  requireAdministrator(ctx)
  await requireAssignableRoles(subject, input.roles)
  const { agents, version } = await readStoredAgentsForAdministration()
  requireStored(subject, agents)
  await writeStoredAgents(agents.map(agent => agent.subject === subject ? { ...agent, label: input.label, roles: input.roles } : agent), version)
  await forgetSubject(subject)
}

/** AGT-3, AGT-6 */
async function revokeAgent (ctx: AuthContext, subject: string): Promise<void> {
  requireAdministrator(ctx)
  const { agents, version } = await readStoredAgentsForAdministration()
  requireStored(subject, agents)
  await writeStoredAgents(agents.filter(agent => agent.subject !== subject), version)
  await forgetSubject(subject)
}

export { listAgents, createAgent, reissueAgentToken, updateAgent, revokeAgent }
