import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import runtime from '@genoacms/adapter-gcp/storage/runtime'
import { verify, peekUnverifiedHeader } from '../src/lib/script/signing/envelope'
import { parseKeyRegistry, findPublicKey } from '../src/lib/script/signing/registry'
import { startServer, type RunningServer, type User } from './server'
import { signIn } from './client'
import { enabled, removeInstance } from './bucket'
import { launchBrowser, closeBrowser, signedInSession, type Session } from './browser'

type Parsed = ReturnType<typeof JSON.parse>

const SETUP_TIMEOUT_MS = 300_000
const TEST_TIMEOUT_MS = 120_000

const projectId = process.env.GENOACMS_TEST_GCP_PROJECT ?? 'genoacms'
const bucket = process.env.GENOACMS_TEST_GCP_BUCKET ?? 'genoacms-tests'

const password = (): string => randomBytes(18).toString('base64url')
const run = randomBytes(4).toString('hex')

const AGENT = 'agent:e2e-builder'
const agentToken = randomBytes(32).toString('base64url')
const ada: User = { subject: 'e2e-ada', email: 'ada@e2e.test', password: password() }
const impostor: User = { subject: AGENT, email: 'impostor@e2e.test', password: password() }

const TOOLS = [
  'list_components', 'get_component', 'create_component', 'update_component', 'get_component_source', 'save_component_source',
  'publish_component', 'delete_component', 'list_pages', 'get_page', 'create_page', 'add_node', 'set_values', 'move_node',
  'remove_node', 'set_preview_url', 'build_page', 'delete_page'
]

let server: RunningServer
let session: Session
let nextId = 1

async function post (body: unknown, token: string | undefined = agentToken): Promise<Response> {
  return await fetch(`${server.origin}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` })
    },
    body: JSON.stringify(body)
  })
}

async function rpc (method: string, params: unknown = {}): Promise<Parsed> {
  const response = await post({ jsonrpc: '2.0', id: nextId++, method, params })
  expect(response.status).toBe(200)
  return await response.json()
}

async function callTool (name: string, args: unknown): Promise<{ isError: boolean, text: string, output: Parsed }> {
  const answer = await rpc('tools/call', { name, arguments: args })
  if (answer.error !== undefined) throw new Error(`${name}: JSON-RPC error ${answer.error.code} ${answer.error.message}`)
  return { isError: answer.result.isError === true, text: answer.result.content[0]?.text ?? '', output: answer.result.structuredContent }
}

async function useTool (name: string, args: unknown): Promise<Parsed> {
  const outcome = await callTool(name, args)
  if (outcome.isError) throw new Error(`${name} failed: ${outcome.text}`)
  return outcome.output
}

const stringAttribute = (title: string) => ({ type: 'string', schema: { type: 'string', title, description: '', required: false } })
const slotAttribute = (title: string, accepted: string[]) => ({ type: 'components', schema: { type: 'array', title, description: '', required: false, items: { type: 'string', enum: accepted } } })

async function readObject (name: string): Promise<unknown> {
  const storage = await runtime.create({ projectId }, { name: 'e2e', resources: [bucket] })
  const object = await storage.getObject({ bucket, name })
  const chunks: Buffer[] = []
  for await (const chunk of object.data as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function verifiedTree (page: string): Promise<Parsed> {
  const registry = parseKeyRegistry(((await readObject('.genoacms/keys/public.json')) as { payload: unknown }).payload)
  if (!registry.ok) throw new Error(`e2e/registry: ${registry.reason}`)
  const candidate = await readObject(`.genoacms/pages/readables/${page}`)
  const keyId = peekUnverifiedHeader(candidate)?.keyId ?? ''
  const publicKey = findPublicKey(registry.registry, keyId)
  if (publicKey === undefined) throw new Error(`e2e/unknown-key: ${keyId}`)
  const verified = verify(candidate, 'genoacms.pageTree.v1', publicKey)
  if (!verified.valid) throw new Error(`e2e/tree-unverifiable: ${verified.reason}`)
  return verified.payload
}

async function publishedPrebuilt (name: string, attributes: unknown[]): Promise<string> {
  const created = await useTool('create_component', { name, type: 'prebuilt' })
  await useTool('update_component', { uid: created.uid, version: created.version, name, attributes })
  await useTool('publish_component', { uid: created.uid, note: 'e2e' })
  return created.uid
}

describe.skipIf(!enabled).sequential('agents through the running server', { timeout: TEST_TIMEOUT_MS }, () => {
  beforeAll(async () => {
    await removeInstance()
    process.env.GENOACMS_E2E_AGENT_TOKEN = agentToken
    server = await startServer({ primary: [ada, impostor] })
    await launchBrowser()
    session = await signedInSession(server, ada)
  }, SETUP_TIMEOUT_MS)

  afterAll(async () => {
    await closeBrowser()
    await server?.stop()
    await removeInstance()
  }, SETUP_TIMEOUT_MS)

  it.fails('MCP-1, MCP-2: an agent initializes and lists the tools with its token; without it, 401', async () => {
    const initialized = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } })
    expect(initialized.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'genoacms' } })
    expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)

    const listed = await rpc('tools/list')
    expect(listed.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([...TOOLS].sort())

    for (const token of [undefined, `gat_${randomBytes(32).toString('base64url')}`]) {
      const refused = await post({ jsonrpc: '2.0', id: nextId++, method: 'tools/list' }, token)
      expect(refused.status).toBe(401)
      expect(refused.headers.get('www-authenticate')).toBe('Bearer realm="genoacms"')
    }
    expect(server.output()).not.toContain(agentToken)
  })

  it.fails('TOL-3, TOL-4, TOL-5, TOL-6: an agent registers, describes, codes and publishes a component', async () => {
    const created = await useTool('create_component', { name: `E2E hero ${run}`, type: 'dynamic' })
    const described = await useTool('update_component', { uid: created.uid, version: created.version, name: `E2E hero ${run}`, attributes: [stringAttribute('heading')] })
    expect(typeof described.version).toBe('string')

    const source = await useTool('get_component_source', { uid: created.uid })
    expect(source.signature.text).toContain('heading')
    await useTool('save_component_source', { uid: created.uid, version: source.version, body: 'return heading' })

    const published = await useTool('publish_component', { uid: created.uid, note: 'by an agent' })
    expect(published.publicationId).toEqual(expect.any(String))

    const read = await useTool('get_component', { uid: created.uid })
    expect(read).toMatchObject({ type: 'dynamic', publication: { publicationId: published.publicationId } })
    expect(read.attributes).toEqual([expect.objectContaining({ type: 'string', schema: expect.objectContaining({ title: 'heading' }) })])
  })

  it.fails('TOL-9, TOL-10, TOL-11, TOL-15: an agent composes a page and builds it, and the tree verifies', async () => {
    const card = await publishedPrebuilt(`E2E card ${run}`, [stringAttribute('heading')])
    const section = await publishedPrebuilt(`E2E section ${run}`, [slotAttribute('children', [`E2E card ${run}`])])
    const page = `e2e-${run}`
    const sectionHeader = await useTool('get_component', { uid: section })
    const cardHeader = await useTool('get_component', { uid: card })

    let { version } = await useTool('create_page', { name: page, component: section })
    const view = await useTool('get_page', { name: page })
    const added = await useTool('add_node', { page, version, parent: view.root, slot: sectionHeader.attributes[0].uid, component: card })
    ;({ version } = await useTool('set_values', { page, version: added.version, node: added.node, values: { [cardHeader.attributes[0].uid]: 'Hello from an agent' } }))
    expect(typeof version).toBe('string')
    await useTool('build_page', { page })

    const tree = await verifiedTree(page)
    expect(tree).toMatchObject({ component: `E2E section ${run}`, uid: section })
    expect(tree.data.children).toEqual([expect.objectContaining({ component: `E2E card ${run}`, uid: card, data: { heading: 'Hello from an agent' } })])
  })

  it.fails('TOL-1: a save from a version a person has since changed in the browser is refused', async () => {
    const uid = await publishedPrebuilt(`E2E contested ${run}`, [stringAttribute('heading')])
    const read = await useTool('get_component', { uid })

    const { page } = session
    await page.goto(`/components/registrar/${uid}`)
    await page.getByRole('button', { name: 'Change name' }).click()
    await page.getByRole('dialog').getByRole('textbox').fill(`E2E renamed by a person ${run}`)
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect.poll(async () => (await useTool('get_component', { uid })).name, { timeout: 30_000 }).toBe(`E2E renamed by a person ${run}`)

    const stale = await callTool('update_component', { uid, version: read.version, name: `E2E renamed by an agent ${run}`, attributes: read.attributes })
    expect(stale.isError).toBe(true)
    expect(stale.text).toBe(`conflict/modified-since: component ${uid} has changed since version ${read.version}; read it again.`)
    expect((await useTool('get_component', { uid })).name).toBe(`E2E renamed by a person ${run}`)
  })

  it.fails('AGT-4: the agent\'s subject cannot sign in on the sign-in page', async () => {
    expect(await signIn(server, impostor.email, impostor.password)).toEqual({ outcome: 'failed', status: 400, reason: 'invalid-credentials' })
    expect(server.output()).toMatch(/\[genoacms:auth\].*primary/)
    expect(await signIn(server, AGENT, agentToken)).toEqual({ outcome: 'failed', status: 400, reason: 'invalid-credentials' })
  })
})
