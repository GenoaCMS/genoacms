import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Grant } from '$lib/script/authorization/grants'
import type { Permission } from '$lib/script/authorization/permissions'
import type { AuthContext } from '$lib/script/authorization/context'
import { collections } from '../../../../genoa.config/collections'

/**
 * Enforcement in the user-facing database layer.
 *
 * Permissions here are **collection-scoped**, which is the property most worth pinning: a grant on
 * `articles` must not reach `users`, and the resource has to be derived correctly from two different
 * reference shapes — a collection reference carries its own name, a document reference carries its
 * collection's.
 *
 * The primary service is stubbed and records what reached it, so "denied" means the operation never
 * ran rather than that an error surfaced somewhere.
 */

type Data = Record<string, unknown>

const calls: string[] = []
const written: Data[] = []
let storedDocument: Data | undefined = {}
let storedCollection: Data[] = []

vi.mock('./database.server', () => ({
  getCollectionReferences: () => ['articles', 'users', 'products'],
  getCollectionReference: async (name: string) => {
    calls.push(`getCollectionReference:${name}`)
    return { name, schema: {} }
  },
  getCollection: async (reference: { name: string }) => {
    calls.push(`getCollection:${reference.name}`)
    return { documents: storedCollection.map((data, index) => ({ reference: { collection: reference, id: String(index) }, data })) }
  },
  getDocument: async (reference: { collection: { name: string }, id: string }) => {
    calls.push(`getDocument:${reference.collection.name}/${reference.id}`)
    return storedDocument === undefined ? undefined : { reference, data: storedDocument }
  },
  createDocument: async (reference: { name: string }, document: Data) => {
    calls.push(`createDocument:${reference.name}`)
    written.push(document)
    return {}
  },
  updateDocument: async (reference: { collection: { name: string }, id: string }, document: Data) => {
    calls.push(`updateDocument:${reference.collection.name}/${reference.id}`)
    written.push(document)
  },
  deleteDocument: async (reference: { collection: { name: string }, id: string }) => {
    calls.push(`deleteDocument:${reference.collection.name}/${reference.id}`)
  }
}))

const { createAuthContext } = await import('$lib/script/authorization/context')
const { WILDCARD } = await import('$lib/script/authorization/grants')
const { PermissionDeniedError } = await import('$lib/script/authorization/enforce')
const database = await import('./user.server')

const collectionGrant = (permission: Permission, id: string): Grant =>
  ({ permission, resource: { scope: 'collection', id } } as Grant)

const contextWith = (grants: Grant[]): AuthContext => createAuthContext('subject-1', grants)

const reader = () => contextWith([collectionGrant('db:collection:read', 'articles')])
const writer = () => contextWith([collectionGrant('db:collection:write', 'articles')])
const deleter = () => contextWith([collectionGrant('db:collection:delete', 'articles')])
const nobody = () => contextWith([])

const articles = { name: 'articles', schema: {} } as never
const articleDocument = { collection: articles, id: 'doc-1' } as never

const fieldGrant = (permission: Permission, fields: string[]): Grant =>
  ({ ...collectionGrant(permission, 'articles'), fields } as Grant)

beforeEach(() => {
  calls.length = 0
  written.length = 0
  storedDocument = {}
  storedCollection = []
})

const expectDenied = async (operation: () => unknown): Promise<void> => {
  await expect(Promise.resolve().then(operation)).rejects.toBeInstanceOf(PermissionDeniedError)
  expect(calls).toEqual([])
}

describe('reading', () => {
  it('DOC-1: is denied without the read permission', async () => {
    await expectDenied(() => database.getUserCollection(nobody(), articles))
    await expectDenied(() => database.getUserDocument(nobody(), articleDocument))
    await expectDenied(() => database.getUserCollectionReference(nobody(), 'articles'))
  })

  it('DOC-1: is allowed with it', async () => {
    await database.getUserCollection(reader(), articles)
    await database.getUserDocument(reader(), articleDocument)
    expect(calls).toEqual(['getCollection:articles', 'getDocument:articles/doc-1'])
  })

  it('DOC-1: does not carry from one collection to another', async () => {
    // The grant names `articles`. Reading `users` with it would make the scope decorative.
    await expectDenied(() => database.getUserCollection(reader(), { name: 'users' } as never))
    await expectDenied(() =>
      database.getUserDocument(reader(), { collection: { name: 'users' }, id: 'doc-1' } as never))
  })

  it('DOC-1: resolves the collection from a document reference, not only a collection one', async () => {
    // The two shapes carry the name in different places; reading the wrong one would check the
    // wrong resource, or nothing at all.
    await expectDenied(() =>
      database.getUserDocument(contextWith([collectionGrant('db:collection:read', 'doc-1')]), articleDocument))
  })
})

describe('writing', () => {
  it('DOC-1: is denied to a reader', async () => {
    await expectDenied(() => database.createUserDocument(reader(), articles, {}))
    await expectDenied(() => database.updateUserDocument(reader(), articleDocument, {}))
  })

  it('DOC-1: is allowed with the write permission', async () => {
    await database.createUserDocument(writer(), articles, {})
    await database.updateUserDocument(writer(), articleDocument, {})
    expect(calls).toEqual(['createDocument:articles', 'getDocument:articles/doc-1', 'updateDocument:articles/doc-1'])
  })

  it('DOC-1: does not imply reading', async () => {
    await expectDenied(() => database.getUserCollection(writer(), articles))
  })
})

describe('deleting', () => {
  it('DOC-1: is denied to a writer', async () => {
    // Otherwise write access would silently include destruction.
    await expectDenied(() => database.deleteUserDocument(writer(), articleDocument))
  })

  it('DOC-1: is allowed with the delete permission', async () => {
    await database.deleteUserDocument(deleter(), articleDocument)
    expect(calls).toEqual(['deleteDocument:articles/doc-1'])
  })
})

describe('getUserCollectionReferences', () => {
  it('COL-3: returns only collections the principal holds a grant on', () => {
    const context = contextWith([
      collectionGrant('db:collection:read', 'articles'),
      collectionGrant('db:collection:read', 'products')
    ])

    expect(database.getUserCollectionReferences(context)).toEqual(['articles', 'products'])
  })

  it('COL-3: returns nothing to a principal with no grants', () => {
    expect(database.getUserCollectionReferences(nobody())).toEqual([])
  })

  it('COL-3: shows a collection the principal may write but not read', () => {
    // Matches the bucket catalog: a principal who may write a collection must still see where
    // their writes go. Every operation on it is demanded separately when it is attempted.
    expect(database.getUserCollectionReferences(writer())).toEqual(['articles'])
  })

  it('COL-3: returns every collection to a wildcard grant', () => {
    const superAdmin = contextWith([{ permission: WILDCARD, resource: WILDCARD }])
    expect(database.getUserCollectionReferences(superAdmin)).toEqual(['articles', 'users', 'products'])
  })
})

describe('reading restricted fields', () => {
  const stored = { title: 'Hello', price: 10, draft: true }

  it('DOC-2: a reader restricted to fields gets only those fields of a document', async () => {
    storedDocument = stored
    const snapshot = await database.getUserDocument(contextWith([fieldGrant('db:collection:read', ['title'])]), articleDocument)
    expect(snapshot?.data).toEqual({ title: 'Hello' })
  })

  it('DOC-2: a reader restricted to fields gets only those fields of every document of a collection', async () => {
    storedCollection = [stored, { title: 'Other', price: 3 }]
    const { documents } = await database.getUserCollection(contextWith([fieldGrant('db:collection:read', ['title'])]), articles)
    expect(documents.map(snapshot => snapshot.data)).toEqual([{ title: 'Hello' }, { title: 'Other' }])
  })

  it('DOC-2: a grant naming no fields, or the wildcard, reads every field', async () => {
    storedDocument = stored
    expect((await database.getUserDocument(reader(), articleDocument))?.data).toEqual(stored)
    const wildcard = contextWith([{ ...collectionGrant('db:collection:read', 'articles'), fields: WILDCARD } as Grant])
    expect((await database.getUserDocument(wildcard, articleDocument))?.data).toEqual(stored)
  })

  it('DOC-2: the fields named by several read grants add up', async () => {
    storedDocument = stored
    const context = contextWith([fieldGrant('db:collection:read', ['title']), fieldGrant('db:collection:read', ['price'])])
    expect((await database.getUserDocument(context, articleDocument))?.data).toEqual({ title: 'Hello', price: 10 })
  })

  it('DOC-2: a named field the document does not have stays absent', async () => {
    storedDocument = { title: 'Hello' }
    const context = contextWith([fieldGrant('db:collection:read', ['title', 'price'])])
    expect((await database.getUserDocument(context, articleDocument))?.data).toStrictEqual({ title: 'Hello' })
  })

  it('DOC-2: write grants do not widen what is read', async () => {
    storedDocument = stored
    const context = contextWith([fieldGrant('db:collection:read', ['title']), collectionGrant('db:collection:write', 'articles')])
    expect((await database.getUserDocument(context, articleDocument))?.data).toEqual({ title: 'Hello' })
  })
})

describe('updating restricted fields', () => {
  it('DOC-3: an unrestricted update reads the stored document, then stores the submission as given', async () => {
    await database.updateUserDocument(writer(), articleDocument, { title: 'New' })
    expect(written).toEqual([{ title: 'New' }])
    expect(calls).toEqual(['getDocument:articles/doc-1', 'updateDocument:articles/doc-1'])
  })

  it('DOC-3: a restricted update keeps the stored value of every field it may not write', async () => {
    storedDocument = { title: 'Old', price: 10 }
    const context = contextWith([fieldGrant('db:collection:write', ['title'])])
    await database.updateUserDocument(context, articleDocument, { title: 'New', price: 0 })
    expect(written).toEqual([{ title: 'New', price: 10 }])
  })

  it('DOC-3: a writable field the submission lacks keeps its stored value', async () => {
    storedDocument = { title: 'Old', price: 10 }
    const context = contextWith([fieldGrant('db:collection:write', ['title', 'price'])])
    await database.updateUserDocument(context, articleDocument, { title: 'New' })
    expect(written).toEqual([{ title: 'New', price: 10 }])
  })

  it('DOC-3: with nothing stored, a restricted update fails as not found and stores nothing', async () => {
    storedDocument = undefined
    const context = contextWith([fieldGrant('db:collection:write', ['title'])])
    await expect(database.updateUserDocument(context, articleDocument, { title: 'New', price: 0 })).rejects.toThrow('documents/not-found: articles/doc-1')
    expect(written).toEqual([])
  })
})

describe('creating with restricted fields', () => {
  it('DOC-4: creation drops the fields the writer may not write', async () => {
    const context = contextWith([fieldGrant('db:collection:write', ['title'])])
    await database.createUserDocument(context, articles, { title: 'New', price: 0 })
    expect(written).toStrictEqual([{ title: 'New' }])
  })

  it('DOC-4: an unrestricted creation stores the whole submission', async () => {
    await database.createUserDocument(writer(), articles, { title: 'New', price: 0 })
    expect(written).toEqual([{ title: 'New', price: 0 }])
  })
})

describe('validating what is stored', () => {
  const testCollection = collections.find(collection => collection.name === 'test') as never
  const testDocument = { collection: testCollection, id: 'x' } as never
  const testGrant = (permission: Permission, fields?: string[]): Grant =>
    ({ permission, resource: { scope: 'collection', id: 'test' }, ...(fields === undefined ? {} : { fields }) } as Grant)
  const testWriter = (fields?: string[]) => contextWith([testGrant('db:collection:write', fields)])

  it('DOC-8: a creation the schema refuses is not written', async () => {
    await expect(database.createUserDocument(testWriter(), testCollection, { id: 'not-a-uuid' }))
      .rejects.toThrow(/^documents\/invalid: \/id format/)
    expect(calls).not.toContain('createDocument:test')
  })

  it('DOC-8: an update is validated with the stored fields it keeps', async () => {
    storedDocument = { name: 'a', isA: 'yes' }
    await expect(database.updateUserDocument(testWriter(), testDocument, { name: 'b' }))
      .rejects.toThrow('documents/invalid: /isA type')
    expect(calls).not.toContain('updateDocument:test/x')
  })

  it('DOC-8: a restricted writer\'s update is validated as stored, without the fields it may not write', async () => {
    storedDocument = { name: 'a', isA: true }
    await database.updateUserDocument(testWriter(['name']), testDocument, { name: 'b', isA: 'yes' })
    expect(written).toEqual([{ name: 'b', isA: true }])
  })

  it('DOC-8: the permission is checked before validation', async () => {
    await expect(database.createUserDocument(nobody(), testCollection, { id: 'not-a-uuid' })).rejects.toBeInstanceOf(PermissionDeniedError)
    expect(calls).toEqual([])
  })

  it('DOC-3: an update of a missing document fails as not found and writes nothing', async () => {
    storedDocument = undefined
    await expect(database.updateUserDocument(testWriter(), testDocument, { name: 'b' })).rejects.toThrow('documents/not-found: test/x')
    expect(calls).not.toContain('updateDocument:test/x')
  })
})

describe('the formats of validation', () => {
  const formatted = {
    name: 'formatted',
    primaryKey: { key: 'id', schema: { type: 'string' } },
    schema: {
      type: 'object',
      properties: {
        cover: { format: 'storageResource' },
        author: { type: 'string', format: 'reference' },
        body: { type: 'string', format: 'markdown' },
        summary: { type: 'string', format: 'text' }
      }
    }
  } as never
  const accepted = async (document: Data): Promise<boolean> =>
    await database.createUserDocument(contextWith([collectionGrant('db:collection:write', 'formatted')]), formatted, document).then(() => true, () => false)

  it('DOC-8: reference, markdown and text accept any string', async () => {
    expect(await accepted({ author: '', body: '# any', summary: 'x'.repeat(10_000) })).toBe(true)
  })

  it('DOC-8: storageResource refuses any string and does not check any other value', async () => {
    expect(await accepted({ cover: 'media/a.png' })).toBe(false)
    expect(await accepted({ cover: { bucket: 'media', name: 'a.png' } })).toBe(true)
    expect(await accepted({ cover: { bucket: 'media' } })).toBe(true)
    expect(await accepted({ cover: 5 })).toBe(true)
  })
})
