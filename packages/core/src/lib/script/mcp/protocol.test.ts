import { describe, it, expect, vi, afterEach } from 'vitest'
import { PermissionDeniedError } from '$lib/script/authorization/enforce'
import { captureConsole } from '$lib/script/testing/host'
import { handle, request, callTool, toolRegistry, type Tool } from '$lib/script/testing/mcp'
import { principal, type Parsed } from '$lib/script/testing/requests'
import corePackage from '../../../../package.json'

vi.mock('$lib/script/storage/providers.server', async () => (await import('$lib/script/testing/memoryStorage')).memoryProviders)

const TOOLS = [
  'list_components', 'get_component', 'create_component', 'update_component', 'get_component_source', 'save_component_source',
  'publish_component', 'delete_component', 'list_pages', 'get_page', 'create_page', 'add_node', 'set_values', 'move_node',
  'remove_node', 'set_preview_url', 'build_page', 'delete_page'
]

const agent = principal(['pages:read'], 'agent:site-builder')
const nobody = principal([], 'agent:nobody')

function stubRegistry (handler: Tool['handler']): Tool[] {
  return [{
    name: 'echo',
    description: 'Echoes its text.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
    handler
  }]
}

afterEach(() => { vi.restoreAllMocks() })

describe('the MCP protocol', () => {
  it('MCP-1: initialize names genoacms and the tools capability, at 2025-06-18', async () => {
    for (const asked of ['2025-06-18', '2024-11-05']) {
      const response = await request('initialize', { protocolVersion: asked, capabilities: {}, clientInfo: { name: 'test', version: '1' } }, agent, stubRegistry(async () => ({})))
      expect(response.result).toEqual({
        protocolVersion: '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'genoacms', version: corePackage.version }
      })
    }
  })

  it('MCP-1: ping answers {}, a notification has no response, an unknown method -32601', async () => {
    const registry = stubRegistry(async () => ({}))

    expect(await handle({ jsonrpc: '2.0', id: 7, method: 'ping' }, agent, registry)).toEqual({ jsonrpc: '2.0', id: 7, result: {} })
    expect(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, agent, registry)).toBeUndefined()
    for (const method of ['resources/list', 'prompts/list', 'sampling/createMessage']) {
      const response = await handle({ jsonrpc: '2.0', id: 'x', method }, agent, registry)
      expect(response).toMatchObject({ jsonrpc: '2.0', id: 'x', error: { code: -32601 } })
    }
  })

  it('MCP-4: tools/list lists every tool with its input schema, whatever the grants', async () => {
    const response = await request('tools/list', {}, nobody, await toolRegistry())

    const tools = response.result.tools as Array<{ name: string, description: string, inputSchema: Parsed }>
    expect(tools.map(tool => tool.name).sort()).toEqual([...TOOLS].sort())
    for (const tool of tools) {
      expect(typeof tool.description, tool.name).toBe('string')
      expect(tool.inputSchema, tool.name).toMatchObject({ type: 'object', additionalProperties: false })
    }
  })

  it('MCP-4: arguments not matching the schema are a tool error, an unknown tool -32602', async () => {
    const handler = vi.fn(async () => ({}))
    const registry = stubRegistry(handler)

    for (const args of [{ text: 5 }, {}, { text: 'a', extra: true }]) {
      const outcome = await callTool(agent, 'echo', args, registry)
      expect(outcome.isError, JSON.stringify(args)).toBe(true)
      expect(outcome.text.startsWith('tools/invalid-arguments: '), outcome.text).toBe(true)
    }
    expect(handler).not.toHaveBeenCalled()

    const unknown = await request('tools/call', { name: 'no_such_tool', arguments: {} }, agent, registry)
    expect(unknown.error?.code).toBe(-32602)
  })

  it('MCP-4: a refusal is a tool error carrying its code, Parsed other failure tools/failed', async () => {
    const lines = captureConsole()

    const succeeded = await request('tools/call', { name: 'echo', arguments: { text: 'hi' } }, agent,
      stubRegistry(async (context, args) => ({ echoed: args.text, subject: context.subject })))
    expect(succeeded.result.isError ?? false).toBe(false)
    expect(succeeded.result.structuredContent).toEqual({ echoed: 'hi', subject: 'agent:site-builder' })
    expect(succeeded.result.content).toHaveLength(1)
    expect(succeeded.result.content[0].type).toBe('text')
    expect(JSON.parse(succeeded.result.content[0].text)).toEqual({ echoed: 'hi', subject: 'agent:site-builder' })

    const denial = new PermissionDeniedError('agent:site-builder', 'pages:structure_edit')
    const refused = await request('tools/call', { name: 'echo', arguments: { text: 'hi' } }, agent, stubRegistry(async () => { throw denial }))
    expect(refused.result.isError).toBe(true)
    expect(refused.result.content).toEqual([{ type: 'text', text: denial.message }])
    expect(denial.message.startsWith('permission-denied:')).toBe(true)

    const failed = await callTool(agent, 'echo', { text: 'hi' }, stubRegistry(async () => { throw new TypeError('the disk caught fire') }))
    expect(failed).toMatchObject({ isError: true, text: 'tools/failed: the disk caught fire' })
    expect(lines.some(line => line.includes('the disk caught fire'))).toBe(true)
  })
})
