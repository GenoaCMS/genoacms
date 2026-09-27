import { describe, it, expect, vi, beforeEach } from 'vitest'
import runtime from './runtime.js'

const instances: Array<{ options: unknown, bucket: ReturnType<typeof vi.fn> }> = []
vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn(function (this: any, options: unknown) {
    this.options = options
    this.bucket = vi.fn(() => ({ file: () => ({ getMetadata: async () => [{ generation: 7 }], createReadStream: () => 'stream' }) }))
    instances.push(this)
  })
}))

beforeEach(() => { instances.length = 0 })

describe('the GCP storage runtime', () => {
  it('passes the project, and the credentials only when given', async () => {
    await runtime.create({ projectId: 'p' }, { name: 'a', resources: [] })
    await runtime.create({ projectId: 'p', credentials: { client_email: 'e' } as any }, { name: 'b', resources: [] })
    expect(instances.map(i => i.options)).toEqual([{ projectId: 'p' }, { projectId: 'p', credentials: { client_email: 'e' } }])
  })

  it('builds one client per provider: two providers on this adapter share nothing', async () => {
    const a = await runtime.create({ projectId: 'one' }, { name: 'a', resources: ['x'] })
    const b = await runtime.create({ projectId: 'two' }, { name: 'b', resources: ['y'] })
    expect(instances).toHaveLength(2)
    expect(a).not.toBe(b)
  })

  it('refuses a bucket outside its resources, and reads a registered one with its generation', async () => {
    const storage = await runtime.create({ projectId: 'p' }, { name: 'a', resources: ['registered'] })
    await expect(storage.getObject({ bucket: 'other', name: 'n' })).rejects.toThrow('bucket-unregistered')
    expect(await storage.getObject({ bucket: 'registered', name: 'n' })).toEqual({ data: 'stream', version: '7' })
  })
})
