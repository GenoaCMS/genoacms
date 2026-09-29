import { describe, it, expect, vi } from 'vitest'
import descriptor from './descriptor.js'

const factory = vi.fn()
vi.mock('@genoacms/sveltekit-adapter-cloud-run-functions', () => ({ default: factory }))

describe('the GCP deployment descriptor', () => {
  it('DEP-1: is a deployment target with credentials decoded as JSON', () => {
    expect(descriptor.kind).toBe('deployment')
    expect(descriptor.secretOptions).toEqual({ credentials: 'json' })
  })

  it('DEP-1: loads the cloud-run SvelteKit adapter and points it at the artifact directory', async () => {
    expect((await descriptor.svelteKitAdapter()).default).toBe(factory)
    expect(descriptor.svelteKitOptions?.({ projectId: 'p', region: 'r' }, { outDir: '/x' })).toEqual({ out: '/x' })
  })

  it('DEP-1: loads its procedure lazily', async () => {
    expect(typeof (await descriptor.procedure()).default).toBe('function')
  })

  it('DEP-2: accepts every function setting and reports an invalid one', () => {
    const validate = descriptor.validate as (options: unknown) => string[]
    const settings = { runtime: 'nodejs24', memory: '1Gi', timeoutSeconds: 60, minInstances: 0, maxInstances: 2, ingress: 'all', serviceAccount: 'cms@p.iam.gserviceaccount.com' }
    expect(validate({ projectId: 'p', region: 'r', ...settings })).toEqual([])
    expect(validate({ projectId: 'p', region: 'r', memory: '512MB' })).toEqual(["memory must be a size such as '512Mi' or '1Gi'"])
  })

  it('COM-2, COM-3, DEP-2: requires a project id and a region, and refuses unknown keys', () => {
    const validate = descriptor.validate as (options: unknown) => string[]
    expect(validate({ projectId: 'p', region: 'europe-west3', functionName: 'f' })).toEqual([])
    expect(validate({ projectId: 'p', region: 'r', concurrency: 80 })).toEqual(["unknown option 'concurrency'"])
    expect(validate({ projectId: 'p' })).toHaveLength(1)
    expect(validate({ region: 'r', projectId: '' })).toHaveLength(1)
    expect(validate({})).toContain('projectId is required and must be a non-empty string')
  })
})
