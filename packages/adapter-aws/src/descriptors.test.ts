import { describe, it, expect } from 'vitest'
import storage from './storage/descriptor.js'
import database from './database/descriptor.js'
import deployment from './deployment/descriptor.js'

describe('the AWS descriptors', () => {
  it('name their runtimes and decode credentials as JSON', () => {
    expect([storage.kind, storage.runtime]).toEqual(['storage', '@genoacms/adapter-aws/storage/runtime'])
    expect([database.kind, database.runtime]).toEqual(['database', '@genoacms/adapter-aws/database/runtime'])
    expect(deployment.kind).toBe('deployment')
    for (const descriptor of [storage, database, deployment]) expect(descriptor.secretOptions).toEqual({ credentials: 'json' })
  })

  it('require a region for storage and database, refusing unknown keys', () => {
    for (const descriptor of [storage, database]) {
      expect(descriptor.validate({ region: 'eu-central-1' })).toEqual([])
      expect(descriptor.validate({})).toHaveLength(1)
      expect(descriptor.validate({ region: 'eu-central-1', buckets: [] })).toEqual(["unknown option 'buckets'"])
    }
  })

  it('require region, role, account id and artifact bucket for deployment', () => {
    const valid = { region: 'r', role: 'arn:aws:iam::1:role/x', accountId: '1', artifactBucket: 'b' }
    expect(deployment.validate(valid)).toEqual([])
    for (const key of Object.keys(valid)) expect(deployment.validate({ ...valid, [key]: undefined })).toHaveLength(1)
    expect(deployment.validate({ ...valid, bucket: 'b' })).toEqual(["unknown option 'bucket'"])
  })

  it('loads the SvelteKit Node adapter from this package and points it at the artifact', async () => {
    expect(typeof (await deployment.svelteKitAdapter()).default).toBe('function')
    expect(deployment.svelteKitOptions({}, { outDir: '/a' })).toEqual({ out: '/a' })
  })
})
