import { timingSafeEqual } from 'node:crypto'
import { loadStoredAgents } from '$lib/script/authorization/resolution.server'
import { declaredAgents } from './declared.server'
import { hashAgentToken } from './tokens'

function sameHash (left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8')
  const b = Buffer.from(right, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** MCP-2, AGT-6: the subject whose token this is, declared agents first; looked up on every request. */
async function agentForToken (token: string): Promise<string | undefined> {
  const hash = hashAgentToken(token)
  const declared = (await declaredAgents()).find(agent => sameHash(agent.tokenHash, hash))
  if (declared !== undefined) return declared.subject
  return (await loadStoredAgents()).find(agent => sameHash(agent.tokenHash, hash))?.subject
}

export { agentForToken }
