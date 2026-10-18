import { describe, it } from 'vitest'
import { runStorageConformance } from '@genoacms/conformance'
import * as Minio from 'minio'
import runtime from '../src/runtime.js'

const READY_ATTEMPTS = 30

/** Waits for the server, then creates the bucket the suite runs in, if it is missing (MF2). */
async function ensureBucket (options, bucket) {
  const client = new Minio.Client(options)
  for (let attempt = 1; ; attempt++) {
    try {
      if (!(await client.bucketExists(bucket))) await client.makeBucket(bucket)
      return
    } catch (error) {
      if (attempt === READY_ATTEMPTS) throw error
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}

/** Against a real MinIO: opt-in with GENOACMS_TEST_MINIO=1; everything else comes from the environment. */
if (process.env.GENOACMS_TEST_MINIO === '1') {
  const bucket = process.env.GENOACMS_TEST_MINIO_BUCKET
  const options = {
    endPoint: process.env.MINIO_ENDPOINT,
    port: process.env.MINIO_PORT === undefined ? undefined : Number(process.env.MINIO_PORT),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY
  }
  await ensureBucket(Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)), bucket)
  const storage = runtime.create(options, { name: 'conformance', resources: [bucket] })
  describe('MIO-4, MIO-7, MIO-8, MIO-9, MIO-10, MIO-11, MIO-12: MinIO conformance', () => { runStorageConformance(storage, { bucket }) })
} else {
  describe.skip('MinIO conformance (set GENOACMS_TEST_MINIO=1)', () => { it('runs against a real MinIO', () => {}) })
}
