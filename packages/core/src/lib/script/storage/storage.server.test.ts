import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
import { stringify as stringifyFlatted } from 'flatted'
import type { ObjectReference } from '@genoacms/contracts/storage'
import { memory } from '#lib/script/testing/memoryStorage.js'
import { attribute, header, node, pageEntry, storePublishedComponent, storePage, storedPage } from '#lib/script/testing/components.js'
import { useTool } from '#lib/script/testing/mcp.js'
import { principal } from '#lib/script/testing/requests.js'

const CHUNK_BYTES = 3

vi.mock('#lib/script/storage/providers.server.js', async () => {
  const { memoryProviders } = await import('#lib/script/testing/memoryStorage.js')
  const { streamToString } = await vi.importActual<typeof import('#lib/script/utils.server.js')>('#lib/script/utils.server.js')
  return {
    ...memoryProviders,
    getObject: async (reference: ObjectReference) => {
      const { data, version } = await memoryProviders.getObject(reference)
      const bytes = Buffer.from(await streamToString(data), 'utf8')
      const chunks = Array.from({ length: Math.ceil(bytes.length / CHUNK_BYTES) }, (_, index) =>
        bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES))
      return { data: Readable.from(chunks), version }
    }
  }
})
vi.mock('#lib/script/signing/keyResolution.server.js', async () => (await import('#lib/script/testing/signingKeys.js')).testKeyResolution)
vi.mock('#lib/script/securityPolicy/policy.server.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('#lib/script/securityPolicy/policy.server.js')>(),
  loadSecurityPolicy: async () => (await import('#lib/script/testing/signingKeys.js')).testSecurityPolicy
}))

const storage = await import('./storage.server')
const { readRawManifest, usersManifestPath } = await import('#lib/script/authorization/manifests.server.js')
const { startSession, loadFamily } = await import('#lib/script/auth/session.server.js')

const TEXT = 'Návod na používanie aplikácie — ľščťžýáíéúäôň €😀'

const agent = principal(['components:read', 'pages:read', 'pages:content_edit', 'pages:structure_edit'], 'agent:guide-builder')
const guide = header('6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d', 'Guide', [attribute.string('7b8c9d0e-1f2a-4b3c-9d4e-5f6a7b8c9d0e', 'heading')])
const [HEADING] = guide.attributeOrder

beforeEach(() => {
  memory.clear()
})

describe('objects read as text', () => {
  it('STS-6: the storage service reads text, JSON and flatted objects whole', async () => {
    memory.set('text', TEXT)
    memory.set('text.json', JSON.stringify({ text: TEXT }))
    memory.set('text.flatted', stringifyFlatted({ text: TEXT }))
    const at = (name: string) => ({ bucket: storage.defaultBucketId, name })

    expect(await storage.getObjectString(at('text'))).toBe(TEXT)
    expect(await storage.getObjectJSON(at('text.json'))).toEqual({ text: TEXT })
    expect(await storage.getObjectFlatted(at('text.flatted'))).toEqual({ text: TEXT })
    expect((await storage.getInternalObjectStringVersioned('text')).text).toBe(TEXT)
    expect((await storage.getInternalObjectJSONVersioned('text.json')).data).toEqual({ text: TEXT })
    expect((await storage.getInternalObjectFlattedVersioned('text.flatted')).data).toEqual({ text: TEXT })
  })

  it('STS-6: a manifest is read whole', async () => {
    memory.set(usersManifestPath, TEXT)

    expect((await readRawManifest(usersManifestPath)).text).toBe(TEXT)
  })

  it('STS-6: a session family is read whole', async () => {
    const identity = { subject: TEXT, email: 'ľubomír.šťastný@príklad.sk' }

    const { familyId } = await startSession(identity, 'array')

    expect((await loadFamily(familyId))?.family).toMatchObject(identity)
  })

  it('STS-6: a page edited twenty times by MCP keeps its text', async () => {
    storePublishedComponent(guide)
    storePage(pageEntry('Guide-sk', 'n1', [node('n1', guide, { [HEADING]: TEXT })]))

    for (let save = 1; save <= 20; save++) {
      const { version } = await useTool(agent, 'get_page', { name: 'Guide-sk' })
      await useTool(agent, 'set_values', { page: 'Guide-sk', version, node: 'n1', values: { [HEADING]: `${TEXT} ${save}` } })
      expect(storedPage('Guide-sk').contents.nodes.n1.data[HEADING].value).toBe(`${TEXT} ${save}`)
      expect(memory.allText()).not.toContain('\uFFFD')
    }
  }, 30_000)
})
