import type { AuthContext } from '$lib/script/authorization/context'
import { importModule, type Parsed } from './requests'

/** A tool as the registry of `mcp/tools/registry.server.ts` holds it (RFC-0039 §Files). */
interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (context: AuthContext, args: Parsed) => Promise<unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: Parsed
  error?: { code: number, message: string, data?: unknown }
}

interface ToolOutcome {
  isError: boolean
  text: string
  output: Parsed
}

async function toolRegistry (): Promise<readonly Tool[]> {
  return (await importModule('$lib/script/mcp/tools/registry.server')).toolRegistry
}

/**
 * Hands one parsed JSON-RPC message to `mcp/protocol.ts` for a principal, with the real registry
 * unless one is given; `undefined` for a notification.
 */
async function handle (message: unknown, context: AuthContext, registry?: readonly Tool[]): Promise<JsonRpcResponse | undefined> {
  const { handleMessage } = await importModule('$lib/script/mcp/protocol')
  return await handleMessage(message, context, registry ?? await toolRegistry())
}

let nextId = 1

async function request (method: string, params: unknown, context: AuthContext, registry?: readonly Tool[]): Promise<JsonRpcResponse> {
  const response = await handle({ jsonrpc: '2.0', id: nextId++, method, params }, context, registry)
  if (response === undefined) throw new Error(`${method} answered nothing`)
  return response
}

/** Calls a tool through `tools/call` (MCP-4) and returns its result. */
async function callTool (context: AuthContext, name: string, args: unknown, registry?: readonly Tool[]): Promise<ToolOutcome> {
  const response = await request('tools/call', { name, arguments: args }, context, registry)
  if (response.error !== undefined) throw new Error(`tools/call ${name}: JSON-RPC error ${response.error.code} ${response.error.message}`)
  const text = response.result.content?.[0]?.text ?? ''
  return { isError: response.result.isError === true, text, output: response.result.structuredContent }
}

/** Calls a tool that must succeed, and returns its output. */
async function useTool (context: AuthContext, name: string, args: unknown): Promise<Parsed> {
  const outcome = await callTool(context, name, args)
  if (outcome.isError) throw new Error(`${name} failed: ${outcome.text}`)
  return outcome.output
}

interface EndpointCall {
  method?: 'GET' | 'POST' | 'DELETE'
  token?: string
  authorization?: string
  cookie?: string
  body?: unknown
}

/** A SvelteKit request event for `/mcp`, as the route's handlers receive it. */
function endpointEvent ({ method = 'POST', token, authorization, cookie, body }: EndpointCall): Parsed {
  const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json, text/event-stream' })
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`)
  if (authorization !== undefined) headers.set('authorization', authorization)
  if (cookie !== undefined) headers.set('cookie', cookie)
  const url = new URL('http://localhost/mcp')
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  const cookies = new Map((cookie ?? '').split(';').filter(Boolean).map(pair => pair.trim().split('=') as [string, string]))
  return {
    request: new Request(url, { method, headers, body: method === 'POST' ? payload : undefined }),
    url,
    params: {},
    route: { id: '/mcp' },
    locals: {},
    platform: undefined,
    isDataRequest: false,
    isSubRequest: false,
    cookies: { get: (name: string) => cookies.get(name), getAll: () => [...cookies].map(([name, value]) => ({ name, value })), set: () => {}, delete: () => {}, serialize: () => '' },
    getClientAddress: () => '127.0.0.1',
    setHeaders: () => {},
    fetch
  }
}

/** Calls a handler of `routes/mcp/+server.ts`. */
async function callEndpoint (call: EndpointCall): Promise<Response> {
  const route = await importModule('/src/routes/mcp/+server')
  const handler = route[call.method ?? 'POST']
  return await handler(endpointEvent(call))
}

export { handle, request, callTool, useTool, toolRegistry, endpointEvent, callEndpoint }
export type { Tool, JsonRpcResponse, ToolOutcome }
