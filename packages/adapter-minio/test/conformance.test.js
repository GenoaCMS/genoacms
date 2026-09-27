import { describe, it } from 'vitest'
import { runStorageConformance } from '@genoacms/conformance'
import runtime from '../src/runtime.js'

/** Against a real MinIO: opt-in with GENOACMS_TEST_MINIO=1; everything else comes from the environment. */
if (process.env.GENOACMS_TEST_MINIO === '1') {
  const bucket = process.env.GENOACMS_TEST_MINIO_BUCKET
  const storage = runtime.create({
    endPoint: process.env.MINIO_ENDPOINT,
    port: process.env.MINIO_PORT === undefined ? undefined : Number(process.env.MINIO_PORT),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY
  }, { name: 'conformance', resources: [bucket] })
  runStorageConformance(storage, { bucket })
} else {
  describe.skip('MinIO conformance (set GENOACMS_TEST_MINIO=1)', () => { it('runs against a real MinIO', () => {}) })
}
