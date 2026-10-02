import runtime from '@genoacms/adapter-gcp/storage/runtime'

export const enabled = process.env.GENOACMS_TEST_GCP === '1'
const projectId = process.env.GENOACMS_TEST_GCP_PROJECT ?? 'genoacms'
const bucket = process.env.GENOACMS_TEST_GCP_BUCKET ?? 'genoacms-tests'

/** Removes everything core keeps in the test bucket, so each run bootstraps an instance of its own. */
export async function removeInstance (): Promise<void> {
  const storage = await runtime.create({ projectId }, { name: 'e2e', resources: [bucket] })
  await storage.deleteDirectory({ bucket, name: '.genoacms/' })
}
