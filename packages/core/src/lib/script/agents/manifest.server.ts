import { join } from 'path'
import { isPreconditionFailed } from '@genoacms/contracts/storage'
import { readSignedDocument } from '#lib/script/signing/signedDocument.server.js'
import { ConflictError } from '#lib/script/components/conflict.js'
import { readRawManifest, securityDirectory, writeSignedManifest } from '#lib/script/authorization/manifests.server.js'
import type { JsonValue } from '#lib/script/signing/canonical.js'
import type { DocumentType } from '#lib/script/signing/envelope.js'
import { parseAgentsManifest, serializeAgentsManifest, type AgentRecord } from './manifest'

const agentsManifestPath = join(securityDirectory, 'agents.json')
const AGENTS_DOCUMENT: DocumentType = 'genoacms.agents.v1'
const EMPTY_AGENTS: JsonValue = { agents: {} }

interface StoredAgents {
  agents: AgentRecord[]
  version?: string
}

/**
 * AGT-2: the stored agents, for an administrator. An absent manifest is empty; one that does not
 * verify is refused, never replaced, as `authorization/administration.server.ts` does for users.
 */
async function readStoredAgentsForAdministration (): Promise<StoredAgents> {
  let raw
  try {
    raw = await readRawManifest(agentsManifestPath)
  } catch {
    return { agents: [] }
  }
  const read = await readSignedDocument(JSON.parse(raw.text), AGENTS_DOCUMENT)
  if (!read.ok) throw new Error(`manifest/unverified: ${agentsManifestPath}: ${read.reason}`)
  const parsed = parseAgentsManifest(read.payload)
  if (!parsed.ok) throw new Error(`manifest/invalid: ${agentsManifestPath}: ${parsed.reason}`)
  return { agents: parsed.value, version: raw.version }
}

/** AGT-2, HIS-2: written on condition that the manifest still has `version`, or is still absent. */
async function writeStoredAgents (agents: AgentRecord[], version: string | undefined): Promise<void> {
  try {
    await writeSignedManifest(agentsManifestPath, AGENTS_DOCUMENT, serializeAgentsManifest(agents) as unknown as JsonValue, version)
  } catch (error) {
    if (isPreconditionFailed(error)) throw new ConflictError('agents', version ?? 'absent')
    throw error
  }
}

export { agentsManifestPath, AGENTS_DOCUMENT, EMPTY_AGENTS, readStoredAgentsForAdministration, writeStoredAgents }
export type { StoredAgents }
