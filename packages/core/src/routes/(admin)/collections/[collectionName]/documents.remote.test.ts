import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Grant } from '$lib/script/authorization/grants'
import { importModule } from '$lib/script/testing/requests'

type Data = Record<string, unknown>

const service = vi.hoisted(() => ({
  createUserDocument: vi.fn(),
  updateUserDocument: vi.fn(),
  getUserCollectionReference: vi.fn()
}))
const request = vi.hoisted(() => ({ locals: {} as Record<string, unknown> }))

vi.mock('$app/server', () => ({
  command: (_validation: unknown, run: object) => Object.assign(run, { __: { type: 'command' } }),
  getRequestEvent: () => request
}))
vi.mock('$lib/script/database/user.server', () => service)

const { createAuthContext } = await import('$lib/script/authorization/context')
const { PermissionDeniedError } = await import('$lib/script/authorization/enforce')
const { createDoc } = await import('./create.remote')
const { updateDoc } = await import('./[documentId]/update.remote')

const collection = {
  name: 'articles',
  primaryKey: { key: 'id', schema: { type: 'string' } },
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      count: { type: 'number' },
      cover: { format: 'storageResource' },
      author: { type: 'string', format: 'reference' },
      body: { type: 'string', format: 'markdown' },
      summary: { type: 'string', format: 'text' }
    }
  }
}

const create = createDoc as unknown as (data: { collectionName?: string, documentData?: Data }) => Promise<Data>
const update = updateDoc as unknown as (data: { collectionName?: string, documentId?: string, documentData?: Data }) => Promise<Data>

beforeEach(() => {
  vi.clearAllMocks()
  request.locals = { auth: createAuthContext('subject-1', [{ permission: '*', resource: '*' } as Grant]) }
  service.getUserCollectionReference.mockResolvedValue(collection)
  service.createUserDocument.mockResolvedValue({ reference: { collection, id: 'new-id' }, data: {} })
  service.updateUserDocument.mockResolvedValue({ reference: { collection, id: 'doc-1' }, data: {} })
})

describe('creating from the editor', () => {
  it('DOC-5: a missing argument answers Invalid data format', async () => {
    expect(await create({ documentData: { title: 'a' } })).toEqual({ status: 'fail', text: 'Invalid data format' })
    expect(await create({ collectionName: 'articles' })).toEqual({ status: 'fail', text: 'Invalid data format' })
    expect(service.createUserDocument).not.toHaveBeenCalled()
  })

  it('DOC-5: data the schema rejects answers Invalid document data, without errors, and stores nothing', async () => {
    const { DocumentValidationError } = await importModule('$lib/script/database/errors')
    service.createUserDocument.mockRejectedValue(new DocumentValidationError([{ instancePath: '/count', keyword: 'type' }]))

    const answer = await create({ collectionName: 'articles', documentData: { title: 'a' } })

    expect(answer).toMatchObject({ status: 'fail', text: 'Invalid document data' })
    expect(answer.errors).toBeUndefined()
  })

  it('DOC-5: a created document answers Document created with its id', async () => {
    expect(await create({ collectionName: 'articles', documentData: { title: 'a' } }))
      .toEqual({ status: 'success', text: 'Document created', id: 'new-id' })
  })

  it('DOC-5: a permission denial is thrown, not returned', async () => {
    service.createUserDocument.mockRejectedValue(new PermissionDeniedError('subject-1', 'db:collection:write', 'articles'))

    await expect(create({ collectionName: 'articles', documentData: { title: 'a' } })).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it('DOC-5: any other failure answers Error creating document', async () => {
    service.createUserDocument.mockRejectedValue(new Error('adapter down'))

    expect(await create({ collectionName: 'articles', documentData: { title: 'a' } })).toEqual({ status: 'fail', text: 'Error creating document' })
  })
})

describe('updating from the editor', () => {
  it('DOC-5: a missing argument answers Invalid data format', async () => {
    expect(await update({ collectionName: 'articles', documentData: { title: 'a' } })).toEqual({ status: 'fail', text: 'Invalid data format' })
    expect(await update({ documentId: 'doc-1', documentData: { title: 'a' } })).toEqual({ status: 'fail', text: 'Invalid data format' })
    expect(await update({ collectionName: 'articles', documentId: 'doc-1' })).toEqual({ status: 'fail', text: 'Invalid data format' })
    expect(service.updateUserDocument).not.toHaveBeenCalled()
  })

  it('DOC-5: data the schema rejects answers Invalid document data, without errors, and stores nothing', async () => {
    const { DocumentValidationError } = await importModule('$lib/script/database/errors')
    service.updateUserDocument.mockRejectedValue(new DocumentValidationError([{ instancePath: '/title', keyword: 'type' }]))

    const answer = await update({ collectionName: 'articles', documentId: 'doc-1', documentData: { title: 'a' } })

    expect(answer).toMatchObject({ status: 'fail', text: 'Invalid document data' })
    expect(answer.errors).toBeUndefined()
  })

  it('DOC-5: an updated document answers Document updated', async () => {
    expect(await update({ collectionName: 'articles', documentId: 'doc-1', documentData: { title: 'a' } }))
      .toEqual({ status: 'success', text: 'Document updated' })
    expect(service.updateUserDocument).toHaveBeenCalledWith(expect.anything(), { collection, id: 'doc-1' }, { title: 'a' })
  })

  it('DOC-5: a permission denial is thrown, not returned', async () => {
    service.updateUserDocument.mockRejectedValue(new PermissionDeniedError('subject-1', 'db:collection:write', 'articles'))

    await expect(update({ collectionName: 'articles', documentId: 'doc-1', documentData: { title: 'a' } })).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it('DOC-5: any other failure answers Error updating document', async () => {
    service.updateUserDocument.mockRejectedValue(new Error('adapter down'))

    expect(await update({ collectionName: 'articles', documentId: 'doc-1', documentData: { title: 'a' } })).toEqual({ status: 'fail', text: 'Error updating document' })
  })
})
