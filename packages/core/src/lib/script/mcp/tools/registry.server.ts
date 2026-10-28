import type { AuthContext } from '$lib/script/authorization/context'
import * as components from './components.server'
import * as pages from './pages.server'

type JsonSchema = Record<string, unknown>

interface Tool {
  name: string
  description: string
  inputSchema: JsonSchema
  handler: (context: AuthContext, args: Record<string, unknown>) => Promise<unknown>
}

const text = { type: 'string' }
const identifier = { type: 'string', minLength: 1 }
const version = { type: 'string', description: 'The version returned by the read that this change is based on.' }
const position = { type: 'integer', minimum: 0, description: '0-based; the end when absent.' }

const object = (properties: JsonSchema, required: string[]): JsonSchema =>
  ({ type: 'object', properties, required, additionalProperties: false })

const ATTRIBUTE_TYPES = ['boolean', 'number', 'string', 'text', 'markdown', 'richText', 'link', 'storageResource', 'components']

const attributeInput = object({
  uid: { ...identifier, description: 'Keeps the attribute and its values on pages; omit for a new attribute.' },
  type: { enum: ATTRIBUTE_TYPES },
  schema: { type: 'object', description: 'The meta-schema of the attribute, with title, description and required.' }
}, ['type', 'schema'])

const tool = (name: string, description: string, inputSchema: JsonSchema, handler: Tool['handler']): Tool =>
  ({ name, description, inputSchema, handler })

/** The 18 tools of TOL-2 to TOL-15, in that order. */
const toolRegistry: Tool[] = [
  tool('list_components', 'Lists the components with their publication.', object({}, []), components.listComponents),
  tool('get_component', 'Reads a component with its attributes in order, its publication and its version.', object({ uid: identifier }, ['uid']), components.getComponent),
  tool('create_component', 'Registers a component.', object({ name: identifier, type: { enum: ['prebuilt', 'dynamic'] } }, ['name', 'type']), components.createComponent),
  tool('update_component', 'Saves a component\'s name and its attributes, an ordered list.',
    object({ uid: identifier, version, name: identifier, attributes: { type: 'array', items: attributeInput } }, ['uid', 'version', 'name', 'attributes']), components.updateComponent),
  tool('get_component_source', 'Reads the source of a dynamic component with its signature and version.', object({ uid: identifier }, ['uid']), components.getComponentSource),
  tool('save_component_source', 'Saves the body of a dynamic component.', object({ uid: identifier, version, body: text }, ['uid', 'version', 'body']), components.saveComponentSource),
  tool('publish_component', 'Publishes a component.', object({ uid: identifier, note: text }, ['uid', 'note']), components.publishComponent),
  tool('delete_component', 'Deletes a component that no published page pins.', object({ uid: identifier }, ['uid']), components.deleteComponent),
  tool('list_pages', 'Lists the pages.', object({}, []), pages.listPages),
  tool('get_page', 'Reads a page: its reachable nodes, their values in attribute order, and its version.', object({ name: identifier }, ['name']), pages.getPage),
  tool('create_page', 'Creates a page whose root is a new node of a published component.', object({ name: identifier, component: identifier }, ['name', 'component']), pages.createPage),
  tool('add_node', 'Adds a node of a published component to a slot of a node.',
    object({ page: identifier, version, parent: identifier, slot: identifier, component: identifier, position }, ['page', 'version', 'parent', 'slot', 'component']), pages.addNode),
  tool('set_values', 'Sets values of a node, by attribute uid.', object({ page: identifier, version, node: identifier, values: { type: 'object' } }, ['page', 'version', 'node', 'values']), pages.setValues),
  tool('move_node', 'Moves a node into a slot of a node.',
    object({ page: identifier, version, node: identifier, parent: identifier, slot: identifier, position }, ['page', 'version', 'node', 'parent', 'slot']), pages.moveNode),
  tool('remove_node', 'Removes a node and every node below it.', object({ page: identifier, version, node: identifier }, ['page', 'version', 'node']), pages.removeNode),
  tool('set_preview_url', 'Sets the preview URL of a page.', object({ page: identifier, version, url: text }, ['page', 'version', 'url']), pages.setPreviewUrl),
  tool('build_page', 'Builds the stored page into its signed tree.', object({ page: identifier }, ['page']), pages.buildPage),
  tool('delete_page', 'Deletes a page and its built tree.', object({ page: identifier }, ['page']), pages.deletePage)
]

export { toolRegistry }
export type { Tool, JsonSchema }
