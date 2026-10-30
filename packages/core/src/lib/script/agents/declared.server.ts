import { host } from '#lib/script/host.server.js'
import { AGENT_TOKEN_MIN_LENGTH, hashAgentToken } from './tokens'

/** A declared agent as the endpoint knows it: never the token, only its hash. */
interface DeclaredAgent {
  subject: string
  label: string
  tokenHash: string
}

const AGENT_PATH = 'authentication.agents.'

async function resolveToken (subject: string, entry: { token: unknown }): Promise<string> {
  const resolved = await host.resolve({ token: entry.token }, { token: 'string' }, `${AGENT_PATH}${subject}`)
  return (resolved as { token: unknown }).token as string
}

function requireLongEnough (subject: string, token: unknown): string {
  if (typeof token !== 'string' || token.length < AGENT_TOKEN_MIN_LENGTH) {
    throw new Error(`authentication/agent-token-too-short: the token of ${subject} has fewer than ${AGENT_TOKEN_MIN_LENGTH} characters.`)
  }
  return token
}

function requireDistinct (agents: DeclaredAgent[]): void {
  const seen = new Map<string, string>()
  for (const agent of agents) {
    const other = seen.get(agent.tokenHash)
    if (other !== undefined) throw new Error(`authentication/agent-token-shared: ${other} and ${agent.subject} have the same token.`)
    seen.set(agent.tokenHash, agent.subject)
  }
}

async function resolveDeclared (): Promise<DeclaredAgent[]> {
  const agents: DeclaredAgent[] = []
  for (const [subject, entry] of Object.entries(host.agents)) {
    const token = requireLongEnough(subject, await resolveToken(subject, entry))
    agents.push({ subject, label: entry.label, tokenHash: hashAgentToken(token) })
  }
  requireDistinct(agents)
  return agents
}

let resolved: Promise<DeclaredAgent[]> | undefined

/** AGT-1: resolved and checked once per process, on the first request to `/mcp`; a refusal is kept and thrown again. */
function declaredAgents (): Promise<DeclaredAgent[]> {
  resolved ??= resolveDeclared()
  return resolved
}

export { declaredAgents }
export type { DeclaredAgent }
