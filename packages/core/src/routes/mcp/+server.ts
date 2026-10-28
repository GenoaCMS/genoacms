import type { RequestHandler } from './$types'
import { getAuthContext } from '$lib/script/authorization/grants.server'
import { createAuthContext, type AuthContext } from '$lib/script/authorization/context'
import { agentForToken } from '$lib/script/agents/authenticate.server'
import { handleMessage } from '$lib/script/mcp/protocol'
import { toolRegistry } from '$lib/script/mcp/tools/registry.server'

const BEARER = /^Bearer (.+)$/i
const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600

const unauthorized = (): Response =>
  new Response(null, { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="genoacms"' } })

const methodNotAllowed = (): Response => new Response(null, { status: 405, headers: { Allow: 'POST' } })

const rpcError = (code: number, message: string): Response =>
  Response.json({ jsonrpc: '2.0', id: null, error: { code, message } })

function tokenOf (request: Request): string | undefined {
  return BEARER.exec(request.headers.get('authorization') ?? '')?.[1]
}

// AGT-1
async function subjectOf (token: string): Promise<string | undefined | Response> {
  try {
    return await agentForToken(token)
  } catch (error) {
    console.error(`[genoacms:mcp] the agent endpoint is closed: ${error instanceof Error ? error.message : String(error)}`)
    return new Response(null, { status: 503 })
  }
}

// AGT-6
const contextOf = async (subject: string): Promise<AuthContext> =>
  await getAuthContext(subject) ?? createAuthContext(subject, [])

async function parse (request: Request): Promise<{ message: unknown } | Response> {
  try {
    const message: unknown = JSON.parse(await request.text())
    return Array.isArray(message) ? rpcError(INVALID_REQUEST, 'Batches are not supported') : { message }
  } catch {
    return rpcError(PARSE_ERROR, 'Parse error')
  }
}

// MCP-1, MCP-2
export const POST: RequestHandler = async ({ request }) => {
  const token = tokenOf(request)
  if (token === undefined) return unauthorized()
  const subject = await subjectOf(token)
  if (subject instanceof Response) return subject
  if (subject === undefined) return unauthorized()

  const parsed = await parse(request)
  if (parsed instanceof Response) return parsed
  const response = await handleMessage(parsed.message, await contextOf(subject), toolRegistry)
  return response === undefined ? new Response(null, { status: 202 }) : Response.json(response)
}

export const GET: RequestHandler = methodNotAllowed
export const DELETE: RequestHandler = methodNotAllowed
