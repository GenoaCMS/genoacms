import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Grant } from '$lib/script/authorization/grants'
import type { Permission } from '$lib/script/authorization/permissions'
import type { AuthContext } from '$lib/script/authorization/context'

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

const calls: string[] = []

vi.mock('./database.server', () => ({
  getCollectionReferences: () => ['articles', 'users', 'products'],
  getCollectionReference: async (name: string) => {
    calls.push(`getCollectionReference:${name}`)
    return { name, schema: {} }
  },
  getCollection: async (reference: { name: string }) => {
    calls.push(`getCollection:${reference.name}`)
    return []
  },
  getDocument: async (reference: { collection: { name: string }, id: string }) => {
    calls.push(`getDocument:${reference.collection.name}/${reference.id}`)
    return {}
  },
  createDocument: async (reference: { name: string }) => {
    calls.push(`createDocument:${reference.name}`)
    return {}
  },
  updateDocument: async (reference: { collection: { name: string }, id: string }) => {
    calls.push(`updateDocument:${reference.collection.name}/${reference.id}`)
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
const articleDocument = { collection: { name: 'articles' }, id: 'doc-1' } as never

beforeEach(() => {
  calls.length = 0
})

const expectDenied = async (operation: () => unknown): Promise<void> => {
  await expect(Promise.resolve().then(operation)).rejects.toBeInstanceOf(PermissionDeniedError)
  expect(calls).toEqual([])
}

describe('reading', () => {
  it('is denied without the read permission', async () => {
    await expectDenied(() => database.getUserCollection(nobody(), articles))
    await expectDenied(() => database.getUserDocument(nobody(), articleDocument))
    await expectDenied(() => database.getUserCollectionReference(nobody(), 'articles'))
  })

  it('is allowed with it', async () => {
    await database.getUserCollection(reader(), articles)
    await database.getUserDocument(reader(), articleDocument)
    expect(calls).toEqual(['getCollection:articles', 'getDocument:articles/doc-1'])
  })

  it('does not carry from one collection to another', async () => {
    // The grant names `articles`. Reading `users` with it would make the scope decorative.
    await expectDenied(() => database.getUserCollection(reader(), { name: 'users' } as never))
    await expectDenied(() =>
      database.getUserDocument(reader(), { collection: { name: 'users' }, id: 'doc-1' } as never))
  })

  it('resolves the collection from a document reference, not only a collection one', async () => {
    // The two shapes carry the name in different places; reading the wrong one would check the
    // wrong resource, or nothing at all.
    await expectDenied(() =>
      database.getUserDocument(contextWith([collectionGrant('db:collection:read', 'doc-1')]), articleDocument))
  })
})

describe('writing', () => {
  it('is denied to a reader', async () => {
    await expectDenied(() => database.createUserDocument(reader(), articles, {}))
    await expectDenied(() => database.updateUserDocument(reader(), articleDocument, {}))
  })

  it('is allowed with the write permission', async () => {
    await database.createUserDocument(writer(), articles, {})
    await database.updateUserDocument(writer(), articleDocument, {})
    expect(calls).toEqual(['createDocument:articles', 'updateDocument:articles/doc-1'])
  })

  it('does not imply reading', async () => {
    await expectDenied(() => database.getUserCollection(writer(), articles))
  })
})

describe('deleting', () => {
  it('is denied to a writer', async () => {
    // Otherwise write access would silently include destruction.
    await expectDenied(() => database.deleteUserDocument(writer(), articleDocument))
  })

  it('is allowed with the delete permission', async () => {
    await database.deleteUserDocument(deleter(), articleDocument)
    expect(calls).toEqual(['deleteDocument:articles/doc-1'])
  })
})

describe('getUserCollectionReferences', () => {
  it('returns only collections the principal holds a grant on', () => {
    const context = contextWith([
      collectionGrant('db:collection:read', 'articles'),
      collectionGrant('db:collection:read', 'products')
    ])

    expect(database.getUserCollectionReferences(context)).toEqual(['articles', 'products'])
  })

  it('returns nothing to a principal with no grants', () => {
    expect(database.getUserCollectionReferences(nobody())).toEqual([])
  })

  it('shows a collection the principal may write but not read', () => {
    // Matches the bucket catalogue: a principal who may write a collection must still see where
    // their writes go. Every operation on it is demanded separately when it is attempted.
    expect(database.getUserCollectionReferences(writer())).toEqual(['articles'])
  })

  it('returns every collection to a wildcard grant', () => {
    const superAdmin = contextWith([{ permission: WILDCARD, resource: WILDCARD }])
    expect(database.getUserCollectionReferences(superAdmin)).toEqual(['articles', 'users', 'products'])
  })
})
