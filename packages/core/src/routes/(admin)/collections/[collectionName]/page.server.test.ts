import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Grant } from '#lib/script/authorization/grants.js'

const service = vi.hoisted(() => ({
  getUserCollectionReference: vi.fn(),
  getUserCollection: vi.fn(),
  deleteUserDocument: vi.fn()
}))

vi.mock('#lib/script/database/user.server.js', () => service)

const { createAuthContext } = await import('#lib/script/authorization/context.js')
const { actions } = await import('./+page.server')

const articles = { name: 'articles', primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object' } }
const auth = createAuthContext('subject-1', [{ permission: '*', resource: '*' } as Grant])

function submit (fields: Record<string, string>): Promise<unknown> {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields)) body.set(name, value)
  const event = {
    params: { collectionName: 'articles' },
    request: new Request('http://localhost/collections/articles?/delete', { method: 'POST', body }),
    locals: { auth }
  }
  return (actions.delete as (event: unknown) => Promise<unknown>)(event)
}

beforeEach(() => {
  vi.clearAllMocks()
  service.getUserCollectionReference.mockResolvedValue(articles)
  service.deleteUserDocument.mockResolvedValue(undefined)
})

describe('deleting several documents', () => {
  it('DOC-7: deletes each submitted id, as a string, from the collection of the route', async () => {
    await submit({ documents: JSON.stringify(['first', 7]) })

    expect(service.getUserCollectionReference).toHaveBeenCalledWith(auth, 'articles')
    expect(service.deleteUserDocument.mock.calls).toEqual([
      [auth, { collection: articles, id: 'first' }],
      [auth, { collection: articles, id: '7' }]
    ])
  })

  it('DOC-7: a missing documents field fails with 400 and missing-documents, deleting nothing', async () => {
    expect(await submit({})).toMatchObject({ status: 400, data: { reason: 'missing-documents' } })
    expect(service.deleteUserDocument).not.toHaveBeenCalled()
  })

  it('DOC-7: answers without redirecting', async () => {
    expect(await submit({ documents: JSON.stringify(['first']) })).toBeUndefined()
  })
})
