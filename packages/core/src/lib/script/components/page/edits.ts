import type {
  Attribute,
  AttributeType,
  ComponentHeader
} from '$lib/script/components/componentHeader/component/types'
import type { AttributeValue } from '$lib/script/components/componentHeader/attribute/types'
import type { ComponentNode, ComponentNodeData, IsSerializable, PageContents } from './entry/types'

type Contents = PageContents<IsSerializable>
type Node = ComponentNode<IsSerializable>
type Headers = Map<string, ComponentHeader>

type Refusal = { ok: false, code: string, message: string }
type EditResult = { ok: true, contents: Contents } | Refusal

interface Schema {
  minimum?: number
  maximum?: number
  multipleOf?: number
  decimalPlaces?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  minItems?: number
  maxItems?: number
  items?: { enum?: string[] }
}

const refusal = (code: string, detail: string): Refusal => ({ ok: false, code, message: `${code}: ${detail}` })

/** A refusal that stops an edit, for the services that throw rather than return. */
class PageEditError extends Error {
  constructor (readonly code: string, message: string) {
    super(message)
    this.name = 'PageEditError'
  }
}

function throwRefusal (result: Refusal): never {
  throw new PageEditError(result.code, result.message)
}

const slotUids = (node: Node): string[] =>
  Object.values(node.data).filter(data => data.type === 'components').flatMap(data => data.value as string[])

function defaultValueOf (attribute: Attribute): AttributeValue {
  if (attribute.schema.default) return attribute.schema.default as AttributeValue
  switch (attribute.type) {
    case 'boolean': return false
    case 'number': return 0
    case 'string': case 'text': case 'markdown': case 'richText': return ''
    case 'link': case 'storageResource': case 'components': return []
  }
}

/** PGE-2: a node of a stored header, with a value for every one of its attributes. */
function newNode (header: ComponentHeader): Node {
  const data: ComponentNodeData<IsSerializable> = {}
  for (const attribute of Object.values(header.attributes)) {
    data[attribute.uid] = { uid: attribute.uid, name: attribute.schema.title, type: attribute.type, schema: undefined, value: defaultValueOf(attribute) }
  }
  return { uid: crypto.randomUUID(), entryReference: header.uid, data }
}

function holderOf (contents: Contents, uid: string): { node: Node, slot: string } | undefined {
  for (const node of Object.values(contents.nodes)) {
    const slot = Object.values(node.data).find(data => data.type === 'components' && (data.value as string[]).includes(uid))
    if (slot !== undefined) return { node, slot: slot.uid }
  }
  return undefined
}

function subtreeOf (contents: Contents, uid: string): string[] {
  const node = contents.nodes[uid]
  if (node === undefined) return []
  return [uid, ...slotUids(node).flatMap(child => subtreeOf(contents, child))]
}

function withoutNodes (contents: Contents, uids: string[]): void {
  for (const uid of uids) delete contents.nodes[uid]
}

function slotOf (node: Node, slot: string): { value: string[] } | undefined {
  const data = node.data[slot]
  return data !== undefined && data.type === 'components' ? data as { value: string[] } : undefined
}

function slotSchemaOf (node: Node, slot: string, headers: Headers): Schema | undefined {
  return headers.get(node.entryReference)?.attributes[slot]?.schema as unknown as Schema | undefined
}

function acceptanceRefusal (parent: Node, slot: string, header: ComponentHeader, headers: Headers, occupied: number): Refusal | undefined {
  const schema = slotSchemaOf(parent, slot, headers)
  const accepted: string[] = schema?.items?.enum ?? []
  if (accepted.length > 0 && !accepted.includes(header.name)) return refusal('pages/not-accepted', header.name)
  if (schema?.maxItems !== undefined && occupied >= schema.maxItems) return refusal('pages/slot-full', slot)
  return undefined
}

function insertAt (list: string[], uid: string, position?: number): void {
  const index = position === undefined ? list.length : Math.max(0, Math.min(position, list.length))
  list.splice(index, 0, uid)
}

type Target = { ok: true, parent: Node, slot: { value: string[] } } | Refusal

function targetOf (contents: Contents, parent: string, slot: string): Target {
  const parentNode = contents.nodes[parent]
  if (parentNode === undefined) return refusal('pages/no-such-node', parent)
  const target = slotOf(parentNode, slot)
  if (target === undefined) return refusal('pages/not-a-slot', slot)
  return { ok: true, parent: parentNode, slot: target }
}

function detach (contents: Contents, node: string): void {
  const holder = holderOf(contents, node)
  const holding = holder === undefined ? undefined : slotOf(holder.node, holder.slot)
  holding?.value.splice(holding.value.indexOf(node), 1)
}

function addNode (
  contents: Contents, parent: string, slot: string, header: ComponentHeader, published: boolean,
  headers: Headers, position?: number
): EditResult & { node?: string } {
  const copy = structuredClone(contents)
  const target = targetOf(copy, parent, slot)
  if (!target.ok) return target
  const { parent: parentNode, slot: slotData } = target
  if (!published) return refusal('pages/unpublished-component', header.uid)
  const refused = acceptanceRefusal(parentNode, slot, header, headers, slotData.value.length)
  if (refused !== undefined) return refused
  const created = newNode(header)
  copy.nodes[created.uid] = created
  insertAt(slotData.value, created.uid, position)
  return { ok: true, contents: copy, node: created.uid }
}

function moveRefusal (contents: Contents, node: string, parent: string): Refusal | undefined {
  if (contents.nodes[node] === undefined) return refusal('pages/no-such-node', node)
  if (node === contents.rootNodeUid) return refusal('pages/invalid-move', node)
  if (contents.nodes[parent] === undefined) return refusal('pages/no-such-node', parent)
  if (subtreeOf(contents, node).includes(parent)) return refusal('pages/invalid-move', node)
  return undefined
}

function moveNode (contents: Contents, node: string, parent: string, slot: string, headers: Headers, position?: number): EditResult {
  const copy = structuredClone(contents)
  const invalid = moveRefusal(copy, node, parent)
  if (invalid !== undefined) return invalid
  const target = targetOf(copy, parent, slot)
  if (!target.ok) return target
  const { parent: parentNode, slot: slotData } = target
  detach(copy, node)
  const moved = headers.get(copy.nodes[node].entryReference)
  const refused = moved === undefined ? undefined : acceptanceRefusal(parentNode, slot, moved, headers, slotData.value.length)
  if (refused !== undefined) return refused
  insertAt(slotData.value, node, position)
  return { ok: true, contents: copy }
}

function removeNode (contents: Contents, node: string): EditResult {
  if (contents.nodes[node] === undefined) return refusal('pages/no-such-node', node)
  if (node === contents.rootNodeUid) return refusal('pages/invalid-move', node)
  const copy = structuredClone(contents)
  detach(copy, node)
  withoutNodes(copy, subtreeOf(contents, node))
  return { ok: true, contents: copy }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function numberProblem (value: unknown, schema: Schema): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a number'
  if (schema.minimum !== undefined && value < schema.minimum) return `must be at least ${schema.minimum}`
  if (schema.maximum !== undefined && value > schema.maximum) return `must be at most ${schema.maximum}`
  if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) return `must be a multiple of ${schema.multipleOf}`
  if (schema.decimalPlaces !== undefined && (String(value).split('.')[1]?.length ?? 0) > schema.decimalPlaces) return `must have at most ${schema.decimalPlaces} decimal places`
  return undefined
}

function stringProblem (value: unknown, schema: Schema): string | undefined {
  if (typeof value !== 'string') return 'must be a string'
  if (schema.minLength !== undefined && value.length < schema.minLength) return `must have at least ${schema.minLength} characters`
  if (schema.maxLength !== undefined && value.length > schema.maxLength) return `must have at most ${schema.maxLength} characters`
  if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) return `must match ${schema.pattern}`
  return undefined
}

function listProblem (value: unknown, schema: Schema, itemProblem: (item: unknown) => string | undefined): string | undefined {
  if (!Array.isArray(value)) return 'must be a list'
  if (schema.minItems !== undefined && value.length < schema.minItems) return `must have at least ${schema.minItems} items`
  if (schema.maxItems !== undefined && value.length > schema.maxItems) return `must have at most ${schema.maxItems} items`
  return value.map(itemProblem).find(problem => problem !== undefined)
}

function linkProblem (item: unknown): string | undefined {
  if (!isObject(item) || typeof item.isExternal !== 'boolean') return 'must be a link'
  if (item.isExternal) return typeof item.url === 'string' ? undefined : 'an external link needs a url'
  return typeof item.pageName === 'string' ? undefined : 'an internal link needs a pageName'
}

function storageResourceProblem (item: unknown): string | undefined {
  const complete = isObject(item) && typeof item.bucket === 'string' && typeof item.name === 'string'
  return complete ? undefined : 'must be a { bucket, name } object'
}

/** TOL-11: what is wrong with a value for an attribute of a non-slot type, or `undefined`. */
function checkValue (attribute: Attribute, value: unknown): string | undefined {
  const schema = attribute.schema as unknown as Schema
  const type: AttributeType = attribute.type
  switch (type) {
    case 'boolean': return typeof value === 'boolean' ? undefined : 'must be true or false'
    case 'number': return numberProblem(value, schema)
    case 'string': case 'text': case 'markdown': case 'richText': return stringProblem(value, schema)
    case 'link': return listProblem(value, schema, linkProblem)
    case 'storageResource': return listProblem(value, schema, storageResourceProblem)
    case 'components': return 'is a slot'
  }
}

function valueRefusal (header: ComponentHeader, node: Node, uid: string, value: unknown): Refusal | undefined {
  const attribute = header.attributes[uid]
  if (attribute === undefined || node.data[uid] === undefined) return refusal('pages/invalid-value', `${uid}: is not an attribute of the node`)
  if (attribute.type === 'components') return refusal('pages/slot-not-a-value', uid)
  const problem = checkValue(attribute, value)
  return problem === undefined ? undefined : refusal('pages/invalid-value', `${uid}: ${problem}`)
}

function setValues (contents: Contents, node: string, values: Record<string, unknown>, headers: Headers): EditResult {
  const copy = structuredClone(contents)
  const target = copy.nodes[node]
  if (target === undefined) return refusal('pages/no-such-node', node)
  const header = headers.get(target.entryReference)
  if (header === undefined) return refusal('components/no-such-component', target.entryReference)
  for (const [uid, value] of Object.entries(values)) {
    const refused = valueRefusal(header, target, uid, value)
    if (refused !== undefined) return refused
    target.data[uid].value = value as AttributeValue
  }
  return { ok: true, contents: copy }
}

const sameValue = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)

function reorderingOf (stored: string[], sent: unknown): string[] | undefined {
  if (!Array.isArray(sent) || sent.some(uid => typeof uid !== 'string')) return undefined
  const distinct = new Set(sent as string[])
  return distinct.size === sent.length && sent.every(uid => stored.includes(uid)) ? sent as string[] : undefined
}

interface NodeEditOutcome { content: boolean, structure: boolean }

function applySlotEdit (copy: Contents, node: Node, uid: string, sent: unknown, outcome: NodeEditOutcome): Refusal | undefined {
  const stored = node.data[uid].value as string[]
  const reordered = reorderingOf(stored, sent)
  if (reordered === undefined) return refusal('pages/invalid-slot', uid)
  if (sameValue(stored, reordered)) return undefined
  outcome.structure = true
  withoutNodes(copy, stored.filter(child => !reordered.includes(child)).flatMap(child => subtreeOf(copy, child)))
  node.data[uid].value = reordered
  return undefined
}

function applyValueEdit (header: ComponentHeader, node: Node, uid: string, sent: unknown, outcome: NodeEditOutcome): Refusal | undefined {
  const refused = valueRefusal(header, node, uid, sent)
  if (refused !== undefined) return refused
  if (sameValue(node.data[uid].value, sent)) return undefined
  outcome.content = true
  node.data[uid].value = sent as AttributeValue
  return undefined
}

function sentValues (sent: unknown): { uid: string, values: Record<string, unknown> } | undefined {
  if (!isObject(sent) || typeof sent.uid !== 'string') return undefined
  const data = isObject(sent.data) ? sent.data : {}
  return { uid: sent.uid, values: Object.fromEntries(Object.entries(data).filter(([, item]) => isObject(item) && 'value' in item).map(([key, item]) => [key, (item as Record<string, unknown>).value])) }
}

/** PGE-4: only the values of the sent node are read; the result says whether content or structure changed. */
function applyNodeEdit (contents: Contents, sent: unknown, headers: Headers): EditResult & NodeEditOutcome {
  const outcome: NodeEditOutcome = { content: false, structure: false }
  const read = sentValues(sent)
  const copy = structuredClone(contents)
  const node = read === undefined ? undefined : copy.nodes[read.uid]
  if (read === undefined || node === undefined) return { ...refusal('pages/no-such-node', read?.uid ?? ''), ...outcome }
  const header = headers.get(node.entryReference)
  if (header === undefined) return { ...refusal('components/no-such-component', node.entryReference), ...outcome }
  for (const [uid, value] of Object.entries(read.values)) {
    if (node.data[uid] === undefined) continue
    const refused = node.data[uid].type === 'components'
      ? applySlotEdit(copy, node, uid, value, outcome)
      : applyValueEdit(header, node, uid, value, outcome)
    if (refused !== undefined) return { ...refused, ...outcome }
  }
  return { ok: true, contents: copy, ...outcome }
}

export { defaultValueOf, addNode, moveNode, removeNode, setValues, applyNodeEdit, checkValue, newNode, subtreeOf, PageEditError, throwRefusal }
export type { EditResult, Refusal }
