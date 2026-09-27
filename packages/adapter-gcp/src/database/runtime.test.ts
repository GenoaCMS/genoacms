import { describe, it, expect, vi } from 'vitest'
import runtime from './runtime.js'

const constructed: unknown[] = []
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn(function (options: unknown) { constructed.push(options) })
}))

describe('the Firestore runtime', () => {
  it("defaults the database id to '(default)' and adds credentials only when given", async () => {
    await runtime.create({ projectId: 'p' }, { name: 'db', resources: [] })
    await runtime.create({ projectId: 'p', databaseId: 'other', credentials: { client_email: 'e' } as any }, { name: 'db', resources: [] })
    expect(constructed).toEqual([
      { projectId: 'p', databaseId: '(default)' },
      { projectId: 'p', databaseId: 'other', credentials: { client_email: 'e' } }
    ])
  })
})
