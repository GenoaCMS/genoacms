import runtime from '@genoacms/adapter-gcp/storage/runtime'

export const enabled = process.env.GENOACMS_TEST_GCP === '1'
const projectId = process.env.GENOACMS_TEST_GCP_PROJECT ?? 'genoacms'
const bucket = process.env.GENOACMS_TEST_GCP_BUCKET ?? 'genoacms-tests'

/** Removes everything core keeps in the test bucket, so each run bootstraps an instance of its own. */
export async function removeInstance (): Promise<void> {
  const storage = await runtime.create({ projectId }, { name: 'e2e', resources: [bucket] })
  await storage.deleteDirectory({ bucket, name: '.genoacms/' })
}

/** Stores `content` as the definition file `name` where core looks for the dynamic collections of `database`. */
export async function writeCollectionDefinition (database: string, name: string, content: unknown): Promise<void> {
  const storage = await runtime.create({ projectId }, { name: 'e2e', resources: [bucket] })
  const path = `.genoacms/databases/${database}/collections/${name}`
  await storage.uploadObject({ bucket, name: path }, JSON.stringify(content), {})
}

/** Stores a fixture object at the root of the test bucket. */
export async function writeObject (name: string, data: string): Promise<void> {
  const storage = await runtime.create({ projectId }, { name: 'e2e', resources: [bucket] })
  await storage.uploadObject({ bucket, name }, data, {})
}

export async function deleteObjects (names: string[]): Promise<void> {
  const storage = await runtime.create({ projectId }, { name: 'e2e', resources: [bucket] })
  await Promise.all(names.map(async name => { await storage.deleteObject({ bucket, name }) }))
}
