import runtime from '@genoacms/adapter-gcp/database/runtime'
import type { CollectionReference } from '@genoacms/contracts/database'
import { collections } from '../genoa.config/collections.js'

const projectId = process.env.GENOACMS_TEST_GCP_PROJECT ?? 'genoacms'

type Data = Record<string, unknown>

const adapter = async () => await runtime.create({ projectId }, { name: 'e2e', resources: ['firestore'] })

const collectionNamed = (name: string): CollectionReference => {
  const collection = (collections as CollectionReference[]).find(candidate => candidate.name === name)
  return collection ?? { name, primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object' } }
}

/** Stores a fixture straight through the adapter, bypassing the CMS under test. Returns its id. */
export async function createDocument (collection: string, data: Data): Promise<string> {
  const snapshot = await (await adapter()).createDocument(collectionNamed(collection), data as never)
  return snapshot.reference.id
}

export async function readDocument (collection: string, id: string): Promise<Data | undefined> {
  const snapshot = await (await adapter()).getDocument({ collection: collectionNamed(collection), id } as never)
  return snapshot?.data as Data | undefined
}

/** Removes fixtures, whichever of them still exist. */
export async function deleteDocuments (collection: string, ids: string[]): Promise<void> {
  const database = await adapter()
  await Promise.all(ids.map(async id => { await database.deleteDocument({ collection: collectionNamed(collection), id } as never) }))
}
