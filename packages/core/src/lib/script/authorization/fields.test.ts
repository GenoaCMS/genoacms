import { describe, it, expect } from 'vitest'
import { permittedFields, projectDocument, mergeDocument, writableDocument } from './fields'
import { createAuthContext } from './context'
import { WILDCARD, type Grant } from './grants'

/**
 * Field-level masking (§4.2.2.2).
 *
 * The two properties §4.4.6 names as evidence are asserted here directly: a field added to the
 * schema later is denied by default, and a principal who cannot write a field cannot erase it by
 * leaving it out. Both are the kind of rule that looks obviously true and is easy to implement
 * backwards, so each is stated as its own case rather than inferred from the others.
 */

const COLLECTION = 'products'

const grantOf = (permission: string, fields?: string[] | typeof WILDCARD): Grant =>
  ({
    permission,
    resource: { scope: 'collection', id: COLLECTION },
    ...(fields === undefined ? {} : { fields })
  } as Grant)

const contextWith = (grants: Grant[]) => createAuthContext('subject-1', grants)

const stored = { name: 'Chair', price: 40, wholesale_price: 12 }

describe('which fields are permitted', () => {
  it('is every field when the grant names none', () => {
    // Absence means unrestricted, which is what every grant written before field lists existed
    // already meant.
    const context = contextWith([grantOf('db:collection:read')])
    expect(permittedFields(context, 'db:collection:read', COLLECTION)).toBe(WILDCARD)
  })

  it('is every field for the explicit wildcard', () => {
    const context = contextWith([grantOf('db:collection:read', WILDCARD)])
    expect(permittedFields(context, 'db:collection:read', COLLECTION)).toBe(WILDCARD)
  })

  it('is exactly what a restricted grant names', () => {
    const context = contextWith([grantOf('db:collection:read', ['name', 'price'])])
    expect(permittedFields(context, 'db:collection:read', COLLECTION)).toEqual(['name', 'price'])
  })

  it('unions several grants, so adding one never takes access away', () => {
    const context = contextWith([
      grantOf('db:collection:read', ['name']),
      grantOf('db:collection:read', ['price'])
    ])
    expect(permittedFields(context, 'db:collection:read', COLLECTION)).toEqual(['name', 'price'])
  })

  it('is unrestricted as soon as one applicable grant is', () => {
    const context = contextWith([
      grantOf('db:collection:read', ['name']),
      grantOf('db:collection:read')
    ])
    expect(permittedFields(context, 'db:collection:read', COLLECTION)).toBe(WILDCARD)
  })

  it('keeps read and write lists apart', () => {
    // "May see the price but not change it" is the case field selection exists for.
    const context = contextWith([
      grantOf('db:collection:read', ['name', 'price']),
      grantOf('db:collection:write', ['name'])
    ])

    expect(permittedFields(context, 'db:collection:read', COLLECTION)).toEqual(['name', 'price'])
    expect(permittedFields(context, 'db:collection:write', COLLECTION)).toEqual(['name'])
  })

  it('does not carry a grant on one collection over to another', () => {
    const context = contextWith([grantOf('db:collection:read', ['name'])])
    expect(permittedFields(context, 'db:collection:read', 'orders')).toEqual([])
  })

  it('permits nothing when no grant applies', () => {
    // Fail closed if this is ever called without requirePermission ahead of it.
    expect(permittedFields(contextWith([]), 'db:collection:read', COLLECTION)).toEqual([])
  })
})

describe('projecting a document on read', () => {
  it('returns it untouched when unrestricted', () => {
    expect(projectDocument(stored, WILDCARD)).toBe(stored)
  })

  it('strips the fields not named', () => {
    expect(projectDocument(stored, ['name', 'price'])).toEqual({ name: 'Chair', price: 40 })
  })

  it('denies a field added to the schema later', () => {
    // §4.4.6's new-field default deny. The grant names the fields that existed when it was written;
    // a field added afterwards is not among them and must not appear.
    const withNewField = { ...stored, margin: 8 }
    expect(projectDocument(withNewField, ['name', 'price'])).not.toHaveProperty('margin')
  })

  it('omits a named field the document does not have', () => {
    expect(projectDocument({ name: 'Chair' }, ['name', 'price'])).toEqual({ name: 'Chair' })
  })
})

describe('merging a document on write', () => {
  it('passes an unrestricted submission through unchanged', () => {
    // Masking must change nothing for a principal who was not restricted.
    const submitted = { name: 'Stool' }
    expect(mergeDocument(stored, submitted, WILDCARD)).toBe(submitted)
  })

  it('keeps a field the principal may not write', () => {
    // §4.4.6's write-merge integrity. A submission without `wholesale_price` is the absence of
    // permission to see it, not an instruction to clear it.
    const merged = mergeDocument(stored, { name: 'Stool' }, ['name'])

    expect(merged).toEqual({ name: 'Stool', price: 40, wholesale_price: 12 })
  })

  it('ignores an unwritable field that was submitted anyway', () => {
    const merged = mergeDocument(stored, { name: 'Stool', wholesale_price: 1 }, ['name'])

    expect(merged.wholesale_price).toBe(12)
  })

  it('writes a permitted field that was not stored before', () => {
    const partial: Partial<typeof stored> = { name: 'Chair' }
    const merged = mergeDocument(partial, { price: 40 }, ['price'])
    expect(merged).toEqual({ name: 'Chair', price: 40 })
  })
})

describe('creating a document', () => {
  it('takes only the fields the principal may write', () => {
    // Nothing is stored yet, so an unwritable field is not theirs to set rather than something to
    // preserve.
    expect(writableDocument({ name: 'Stool', wholesale_price: 1 }, ['name']))
      .toEqual({ name: 'Stool' })
  })

  it('passes an unrestricted submission through', () => {
    const submitted = { name: 'Stool', wholesale_price: 1 }
    expect(writableDocument(submitted, WILDCARD)).toBe(submitted)
  })
})
