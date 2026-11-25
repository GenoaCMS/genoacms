import { readFileSync } from 'node:fs'
import { COMPONENTS, type AttributeSpec, type ComponentSpec } from './site/components.ts'
import { PAGE, PAGE_NAME, type NodeSpec } from './site/page.ts'

const ORIGIN = process.env.GENOACMS_DEMO_ORIGIN ?? 'http://localhost:5173'
const NOTHING_CHANGED = 'Nothing has changed since the last publication'

interface ToolResult { isError?: boolean, content?: Array<{ text?: string }>, structuredContent?: unknown }
interface ComponentView { uid: string, name: string, attributes: Array<{ uid: string, type: string, schema: { title: string } }>, version: string }
interface PageView { root: string, nodes: Array<{ uid: string }>, version: string }

function required (name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`demo/missing-variable: set ${name}`)
  return value
}

const token = (): string => readFileSync(required('GENOACMS_AGENT_TOKEN_FILE'), 'utf8').trim()

let nextId = 1

async function rpc (method: string, params: unknown): Promise<unknown> {
  const response = await fetch(new URL('/mcp', ORIGIN), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params })
  })
  if (!response.ok) throw new Error(`demo/mcp-http: ${response.status} ${await response.text()}`)
  const message = await response.json() as { result?: unknown, error?: { message: string } }
  if (message.error !== undefined) throw new Error(`demo/mcp-rpc: ${message.error.message}`)
  return message.result
}

async function tool<T> (name: string, args: Record<string, unknown>): Promise<T> {
  const result = await rpc('tools/call', { name, arguments: args }) as ToolResult
  if (result.isError === true) throw new Error(`${name}: ${result.content?.[0]?.text ?? 'failed'}`)
  return result.structuredContent as T
}

const schemaOf = (spec: AttributeSpec): Record<string, unknown> => {
  const common = { title: spec.name, description: '', required: false }
  switch (spec.type) {
    case 'components': return { ...common, type: 'array', items: { type: 'string' } }
    case 'number': return { ...common, type: 'number' }
    case 'boolean': return { ...common, type: 'boolean' }
    default: return { ...common, type: 'string' }
  }
}

async function componentUid (spec: ComponentSpec): Promise<string> {
  const catalog = await tool<Array<{ uid: string, name: string }>>('list_components', {})
  const existing = catalog.find(entry => entry.name === spec.name)
  if (existing !== undefined) return existing.uid
  return (await tool<{ uid: string }>('create_component', { name: spec.name, type: spec.type })).uid
}

async function describe (uid: string, spec: ComponentSpec): Promise<void> {
  const current = await tool<ComponentView>('get_component', { uid })
  const kept = new Map(current.attributes.map(each => [each.schema.title, each]))
  const attributes = spec.attributes.map(each => ({
    ...(kept.get(each.name)?.type === each.type ? { uid: kept.get(each.name)?.uid } : {}),
    type: each.type,
    schema: schemaOf(each)
  }))
  await tool('update_component', { uid, version: current.version, name: spec.name, attributes })
}

async function writeSource (uid: string, spec: ComponentSpec): Promise<void> {
  if (spec.body === undefined) return
  const body = readFileSync(new URL(`./site/dynamic/${spec.body}.body`, import.meta.url), 'utf8')
  const { version } = await tool<{ version: string }>('get_component_source', { uid })
  await tool('save_component_source', { uid, version, body })
}

async function publishComponent (uid: string, spec: ComponentSpec): Promise<void> {
  try {
    const { warnings } = await tool<{ warnings: Array<{ message: string }> }>('publish_component', { uid, note: 'Kiln & Steel demo site' })
    for (const warning of warnings) console.warn(`${spec.name}: ${warning.message}`)
  } catch (error) {
    if (!(error as Error).message.includes(NOTHING_CHANGED)) throw error
  }
}

async function publishComponents (): Promise<Map<string, ComponentView>> {
  const views = new Map<string, ComponentView>()
  for (const spec of COMPONENTS) {
    const uid = await componentUid(spec)
    await describe(uid, spec)
    await writeSource(uid, spec)
    await publishComponent(uid, spec)
    views.set(spec.name, await tool<ComponentView>('get_component', { uid }))
    console.log(`published ${spec.name}`)
  }
  return views
}

class PageWriter {
  version = ''
  readonly components: Map<string, ComponentView>

  constructor (components: Map<string, ComponentView>) {
    this.components = components
  }

  private view (name: string): ComponentView {
    const view = this.components.get(name)
    if (view === undefined) throw new Error(`demo/unknown-component: ${name}`)
    return view
  }

  private attributeUid (component: string, attribute: string): string {
    const found = this.view(component).attributes.find(each => each.schema.title === attribute)
    if (found === undefined) throw new Error(`demo/unknown-attribute: ${component}.${attribute}`)
    return found.uid
  }

  async create (): Promise<string> {
    const pages = await tool<Array<{ name: string }>>('list_pages', {})
    if (pages.some(page => page.name === PAGE_NAME)) await tool('delete_page', { page: PAGE_NAME })
    await tool('create_page', { name: PAGE_NAME, component: this.view(PAGE.component).uid })
    const page = await tool<PageView>('get_page', { name: PAGE_NAME })
    this.version = page.version
    return page.root
  }

  async fill (uid: string, spec: NodeSpec): Promise<void> {
    const values = Object.fromEntries(Object.entries(spec.values ?? {})
      .map(([name, value]) => [this.attributeUid(spec.component, name), value]))
    if (Object.keys(values).length > 0) {
      this.version = (await tool<{ version: string }>('set_values', { page: PAGE_NAME, version: this.version, node: uid, values })).version
    }
    for (const [slot, children] of Object.entries(spec.slots ?? {})) {
      for (const child of children) await this.add(uid, this.attributeUid(spec.component, slot), child)
    }
  }

  private async add (parent: string, slot: string, spec: NodeSpec): Promise<void> {
    const added = await tool<{ node: string, version: string }>('add_node', {
      page: PAGE_NAME, version: this.version, parent, slot, component: this.view(spec.component).uid
    })
    this.version = added.version
    await this.fill(added.node, spec)
  }
}

async function publish (): Promise<void> {
  const writer = new PageWriter(await publishComponents())
  await writer.fill(await writer.create(), PAGE)
  await tool('build_page', { page: PAGE_NAME })
  console.log(`Page built: ${PAGE_NAME}`)
}

async function clean (): Promise<void> {
  const pages = await tool<Array<{ name: string }>>('list_pages', {})
  if (pages.some(page => page.name === PAGE_NAME)) await tool('delete_page', { page: PAGE_NAME })
  const catalog = await tool<Array<{ uid: string, name: string }>>('list_components', {})
  for (const spec of COMPONENTS) {
    const entry = catalog.find(each => each.name === spec.name)
    if (entry !== undefined) await tool('delete_component', { uid: entry.uid })
  }
  console.log('Site content removed')
}

const COMMANDS: Record<string, () => Promise<void>> = { publish, clean }

const command = COMMANDS[process.argv[2] ?? '']
if (command === undefined) throw new Error(`demo/usage: node demo/site.ts ${Object.keys(COMMANDS).join('|')}`)
await command()
