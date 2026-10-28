import { stringify as stringifyFlatted, parse as parseFlatted } from 'flatted'
import { sign } from '$lib/script/signing/envelope'
import { memory } from './memoryStorage'
import { signingKey } from './signingKeys'
import type { Parsed } from './requests'

type Json = Record<string, Parsed>

const LINK_ITEMS = {
  type: 'object',
  properties: { isExternal: { type: 'boolean' }, url: { type: ['string', 'null'] }, pageName: { type: ['string', 'null'] } },
  required: ['isExternal']
}

const STORAGE_RESOURCE_ITEMS = {
  type: 'object',
  properties: { bucket: { type: 'string' }, name: { type: 'string' } },
  required: ['bucket', 'name']
}

const schemaBase = (title: string) => ({ title, description: '', required: false })

/** A CMP-3 attribute of each type, valid under CMP-4. */
const attribute = {
  boolean: (uid: string, title: string, constraints: Json = {}) =>
    ({ uid, name: title, type: 'boolean', schema: { type: 'boolean', ...schemaBase(title), ...constraints } }),
  number: (uid: string, title: string, constraints: Json = {}) =>
    ({ uid, name: title, type: 'number', schema: { type: 'number', ...schemaBase(title), ...constraints } }),
  string: (uid: string, title: string, constraints: Json = {}, type = 'string') =>
    ({ uid, name: title, type, schema: { type: 'string', ...schemaBase(title), ...constraints } }),
  link: (uid: string, title: string, constraints: Json = {}) =>
    ({ uid, name: title, type: 'link', schema: { type: 'array', ...schemaBase(title), items: LINK_ITEMS, ...constraints } }),
  storageResource: (uid: string, title: string, constraints: Json = {}) =>
    ({ uid, name: title, type: 'storageResource', schema: { type: 'array', ...schemaBase(title), items: STORAGE_RESOURCE_ITEMS, ...constraints } }),
  components: (uid: string, title: string, accepted?: string[], constraints: Json = {}) =>
    ({
      uid,
      name: title,
      type: 'components',
      schema: { type: 'array', ...schemaBase(title), items: accepted === undefined ? { type: 'string' } : { type: 'string', enum: accepted }, ...constraints }
    })
}

function header (uid: string, name: string, attributes: Json[] = [], type: 'prebuilt' | 'dynamic' = 'prebuilt'): Json {
  return {
    uid,
    type,
    name,
    attributes: Object.fromEntries(attributes.map(item => [item.uid, item])),
    attributeOrder: attributes.map(item => item.uid)
  }
}

const headerPath = (uid: string): string => `.genoacms/components/headers/${uid}.json`
const headerHistoryPath = (uid: string): string => `.genoacms/components/headers/${uid}.history`
const definitionPath = (uid: string): string => `.genoacms/components/dynamic/${uid}/data.json`
const definitionHistoryPath = (uid: string): string => `.genoacms/components/dynamic/${uid}/history.json`
const pointerPath = (uid: string): string => `.genoacms/components/publications/${uid}.json`
const entryPath = (name: string): string => `.genoacms/pages/entries/${name}`
const treePath = (name: string): string => `.genoacms/pages/readables/${name}`

/** Stores a header (CMP-1), and a source definition for a dynamic one (SRC-1). */
function storeComponent (stored: Json, body = ''): void {
  memory.set(headerPath(stored.uid), JSON.stringify(stored))
  if (stored.type === 'dynamic') {
    memory.set(definitionPath(stored.uid), stringifyFlatted({ uid: stored.uid, language: 'typescript', body, publishedBody: '', publishedSignature: '' }))
  }
}

/** Stores a publication pointer (PUB-5), which is what makes a component composable (PUB-7). */
function storePublication (uid: string, publicationId = `publication-of-${uid}`): void {
  memory.set(pointerPath(uid), stringifyFlatted({ uid, publicationId, publisherId: 'subject-1', publishedAt: 1_000, note: '', headerDigest: 'digest' }))
}

function storePublishedComponent (stored: Json): void {
  storeComponent(stored)
  storePublication(stored.uid)
}

function emptyValue (item: Json): unknown {
  if (item.schema.default) return item.schema.default
  if (item.type === 'boolean') return false
  if (item.type === 'number') return 0
  if (['link', 'storageResource', 'components'].includes(item.type)) return []
  return ''
}

/** A PGE-1 node of a stored header, its values as PGE-2 creates them unless given. */
function node (uid: string, of: Json, values: Json = {}): Json {
  return {
    uid,
    entryReference: of.uid,
    data: Object.fromEntries(of.attributeOrder.map((key: string) => {
      const item = of.attributes[key]
      return [key, { uid: key, name: item.schema.title, type: item.type, value: key in values ? values[key] : emptyValue(item) }]
    }))
  }
}

function pageEntry (name: string, root: string, nodes: Json[]): Json {
  return {
    name,
    previewURL: '',
    contents: { nodes: Object.fromEntries(nodes.map(item => [item.uid, item])), rootNodeUid: root },
    history: [],
    future: [],
    lastModified: new Date(0).toISOString()
  }
}

function storePage (entry: Json): void {
  memory.set(entryPath(entry.name), stringifyFlatted(entry))
}

/** Stores a published page tree (TRE-1), signed by the test key, whose root pins the component. */
function storeTreePinning (name: string, uid: string): void {
  const tree = { component: 'Pinned', type: 'prebuilt', uid, publicationId: `publication-of-${uid}`, data: {} }
  memory.set(treePath(name), JSON.stringify({ ...sign('genoacms.pageTree.v1', tree, signingKey), payload: tree }))
}

function readFlatted (name: string): Parsed {
  const text = memory.text(name)
  return text === undefined ? undefined : parseFlatted(text)
}

const storedPage = (name: string): Parsed => readFlatted(entryPath(name))
const storedHeader = (uid: string): Parsed => memory.json(headerPath(uid))
const storedDefinition = (uid: string): Parsed => readFlatted(definitionPath(uid))

export {
  attribute,
  header,
  node,
  pageEntry,
  storeComponent,
  storePublication,
  storePublishedComponent,
  storePage,
  storeTreePinning,
  storedPage,
  storedHeader,
  storedDefinition,
  readFlatted,
  headerPath,
  headerHistoryPath,
  definitionPath,
  definitionHistoryPath,
  pointerPath,
  entryPath,
  treePath
}
