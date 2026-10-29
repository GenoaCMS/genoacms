import { validator } from '@exodus/schemasafe'
import type { AuthContext } from '$lib/script/authorization/context'
import { PermissionDeniedError } from '$lib/script/authorization/enforce'
import { ConflictError, UnversionedError } from '$lib/script/components/conflict'
import { ComponentCodeError, ComponentDiffError, NoSuchComponentError } from '$lib/script/components/editor/errors'
import { DocumentNotFoundError, DocumentValidationError } from '$lib/script/database/errors'
import { PageEditError } from '$lib/script/components/page/edits'
import corePackage from '../../../../package.json'
import type { Tool } from './tools/registry.server'

type RequestId = string | number | null

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: RequestId
  result?: unknown
  error?: { code: number, message: string, data?: unknown }
}

const PROTOCOL_VERSION = '2025-06-18'
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602

const REFUSAL_CLASSES = [
  PermissionDeniedError, ConflictError, UnversionedError, PageEditError,
  NoSuchComponentError, ComponentDiffError, ComponentCodeError, DocumentValidationError, DocumentNotFoundError
]
const CODED_MESSAGE = /^[a-z]+(-[a-z]+)*\/[a-z0-9-]+: /

const isRefusal = (error: unknown): error is Error =>
  error instanceof Error && (REFUSAL_CLASSES.some(refusal => error instanceof refusal) || CODED_MESSAGE.test(error.message))

const failure = (id: RequestId, code: number, message: string): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } })
const success = (id: RequestId, result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result })

const toolError = (text: string) => ({ isError: true, content: [{ type: 'text', text }] })

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const validators = new WeakMap<Tool, ReturnType<typeof validator>>()

function validatorOf (tool: Tool) {
  let validate = validators.get(tool)
  if (validate === undefined) {
    validate = validator(tool.inputSchema as never, { includeErrors: true })
    validators.set(tool, validate)
  }
  return validate
}

function mismatch (validate: ReturnType<typeof validator>): string {
  const first = validate.errors?.[0]
  return first === undefined ? 'the arguments do not match the input schema' : `${first.instanceLocation} does not match ${first.keywordLocation}`
}

async function run (tool: Tool, context: AuthContext, args: Record<string, unknown>) {
  try {
    const output = await tool.handler(context, args)
    return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output }
  } catch (error) {
    if (isRefusal(error)) return toolError(error.message)
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[genoacms:mcp] ${tool.name} failed: ${message}`)
    return toolError(`tools/failed: ${message}`)
  }
}

async function callTool (id: RequestId, params: unknown, context: AuthContext, registry: readonly Tool[]): Promise<JsonRpcResponse> {
  const name = isObject(params) ? params.name : undefined
  const tool = registry.find(candidate => candidate.name === name)
  if (tool === undefined) return failure(id, INVALID_PARAMS, `Unknown tool: ${String(name)}`)
  const args = isObject(params) && params.arguments !== undefined ? params.arguments : {}
  const validate = validatorOf(tool)
  if (!validate(args as never)) return success(id, toolError(`tools/invalid-arguments: ${mismatch(validate)}`))
  return success(id, await run(tool, context, args as Record<string, unknown>))
}

const initializeResult = () => ({
  protocolVersion: PROTOCOL_VERSION,
  capabilities: { tools: { listChanged: false } },
  serverInfo: { name: 'genoacms', version: corePackage.version }
})

const listResult = (registry: readonly Tool[]) => ({
  tools: registry.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
})

async function dispatch (id: RequestId, method: string, params: unknown, context: AuthContext, registry: readonly Tool[]): Promise<JsonRpcResponse> {
  switch (method) {
    case 'initialize': return success(id, initializeResult())
    case 'ping': return success(id, {})
    case 'tools/list': return success(id, listResult(registry))
    case 'tools/call': return await callTool(id, params, context, registry)
    default: return failure(id, METHOD_NOT_FOUND, `Method not found: ${method}`)
  }
}

/** MCP-1, MCP-4: one parsed JSON-RPC message; `undefined` for a notification. */
async function handleMessage (message: unknown, context: AuthContext, registry: readonly Tool[]): Promise<JsonRpcResponse | undefined> {
  if (!isObject(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return failure(isObject(message) && (typeof message.id === 'string' || typeof message.id === 'number') ? message.id : null, INVALID_REQUEST, 'Invalid Request')
  }
  if (message.id === undefined) return undefined
  return await dispatch(message.id as RequestId, message.method, message.params, context, registry)
}

export { handleMessage }
export type { JsonRpcResponse }
