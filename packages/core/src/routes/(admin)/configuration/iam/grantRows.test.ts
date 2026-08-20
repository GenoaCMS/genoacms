import { describe, it, expect } from 'vitest'
import {
  emptyRow,
  isIncomplete,
  rowToGrants,
  rowsToGrants,
  grantsToRows,
  withResource,
  withoutResource,
  type GrantRow
} from './grantRows'
import { WILDCARD } from '$lib/script/authorization/grants'
import type { Grant } from '$lib/script/authorization/grants'

/**
 * The grant editor's conversion, tested without rendering anything.
 *
 * What matters is that the round trip is faithful — an administrator opening a role, changing
 * nothing and saving must not alter it — and that a half-finished row never becomes a grant. A
 * permission chosen but not yet given its resource is an edit in progress; submitting it would
 * silently widen or narrow the role.
 */

const row = (over: Partial<GrantRow> = {}): GrantRow => ({ ...emptyRow(), ...over })

describe('completeness', () => {
  it('treats an empty row as incomplete', () => {
    expect(isIncomplete(emptyRow())).toBe(true)
  })

  it('treats an instance-scoped permission as complete on its own', () => {
    // There is no resource to name, so nothing further is required.
    expect(isIncomplete(row({ permission: 'pages:read' }))).toBe(false)
  })

  it('does not start a row applying to every resource', () => {
    // The widest grant the editor can express must be chosen, not defaulted into.
    expect(emptyRow().anywhere).toBe(false)
    expect(isIncomplete(row({ permission: 'storage:bucket:read' }))).toBe(true)
  })

  it('treats a resource-scoped permission as complete when it applies anywhere', () => {
    expect(isIncomplete(row({ permission: 'storage:bucket:read', anywhere: true }))).toBe(false)
  })

  it('treats a named resource with no name as incomplete', () => {
    expect(isIncomplete(row({ permission: 'storage:bucket:read', resources: [] }))).toBe(true)
  })

  it('treats a collection with every field switched off as incomplete', () => {
    // Such a grant permits nothing over the collection, which is not a decision anyone made on
    // purpose — it is a selection still being built.
    expect(isIncomplete(row({
      permission: 'db:collection:read',
      resources: ['articles'],
      fields: { articles: [] }
    }))).toBe(true)
  })

  it('does not demand fields for a permission that has none', () => {
    // Deleting a document does not address individual fields, so no selection is required.
    expect(isIncomplete(row({ permission: 'db:collection:delete', resources: ['articles'] })))
      .toBe(false)
  })
})

describe('naming a resource', () => {
  it('starts a field-selectable collection with nothing selected', () => {
    // Absence of a field list means *every* field, which is right for a stored grant and wrong as
    // the starting point for one being composed: switching a collection on would otherwise hand out
    // every field of it. The row stays incomplete until fields are named or "every field" is chosen.
    const named = withResource(row({ permission: 'db:collection:read' }), 'articles')

    expect(named.fields).toEqual({ articles: [] })
    expect(isIncomplete(named)).toBe(true)
  })

  it('seeds no field selection for a permission that has none', () => {
    const named = withResource(row({ permission: 'storage:bucket:read' }), 'media')

    expect(named.fields).toEqual({})
    expect(isIncomplete(named)).toBe(false)
  })

  it('drops the field selection when the resource is removed', () => {
    // Leaving it behind would silently reapply it if the resource were switched back on.
    const named = withResource(row({ permission: 'db:collection:read' }), 'articles')
    const removed = withoutResource({ ...named, fields: { articles: ['title'] } }, 'articles')

    expect(removed.resources).toEqual([])
    expect(removed.fields).toEqual({})
  })
})

describe('a row becoming grants', () => {
  it('gives an instance-scoped permission the wildcard resource', () => {
    expect(rowToGrants(row({ permission: 'pages:publish' })))
      .toEqual([{ permission: 'pages:publish', resource: WILDCARD }])
  })

  it('emits one grant per named resource', () => {
    // The row is one decision — "may read these two buckets" — and the model stores it as two.
    expect(rowToGrants(row({
      permission: 'storage:bucket:read',
      resources: ['media', 'invoices']
    }))).toEqual([
      { permission: 'storage:bucket:read', resource: { scope: 'bucket', id: 'media' } },
      { permission: 'storage:bucket:read', resource: { scope: 'bucket', id: 'invoices' } }
    ])
  })

  it('derives the scope from the permission rather than asking for it', () => {
    expect(rowToGrants(row({ permission: 'db:collection:read', resources: ['articles'] })))
      .toEqual([{ permission: 'db:collection:read', resource: { scope: 'collection', id: 'articles' } }])
  })

  it('records a field restriction only when there is one', () => {
    // An unrestricted grant carries no `fields` key, so absence keeps meaning "every field" rather
    // than becoming a value that has to be read to be understood.
    const [unrestricted] = rowToGrants(row({
      permission: 'db:collection:read',
      resources: ['articles'],
      fields: { articles: WILDCARD }
    }))
    expect(unrestricted).not.toHaveProperty('fields')

    const [restricted] = rowToGrants(row({
      permission: 'db:collection:read',
      resources: ['articles'],
      fields: { articles: ['title', 'body'] }
    }))
    expect(restricted.fields).toEqual(['title', 'body'])
  })

  it('keeps a separate field selection per collection', () => {
    expect(rowToGrants(row({
      permission: 'db:collection:read',
      resources: ['articles', 'products'],
      fields: { articles: WILDCARD, products: ['name'] }
    }))).toEqual([
      { permission: 'db:collection:read', resource: { scope: 'collection', id: 'articles' } },
      {
        permission: 'db:collection:read',
        resource: { scope: 'collection', id: 'products' },
        fields: ['name']
      }
    ])
  })

  it('ignores fields on a permission that does not admit them', () => {
    // A stale selection left by switching the permission must not reach the grant.
    expect(rowToGrants(row({
      permission: 'db:collection:delete',
      resources: ['articles'],
      fields: { articles: ['title'] }
    }))).toEqual([
      { permission: 'db:collection:delete', resource: { scope: 'collection', id: 'articles' } }
    ])
  })

  it('yields nothing for an incomplete row', () => {
    expect(rowToGrants(emptyRow())).toEqual([])
    expect(rowToGrants(row({ permission: 'storage:bucket:read' }))).toEqual([])
  })
})

describe('collecting rows', () => {
  it('drops incomplete rows rather than submitting them half-formed', () => {
    const rows = [
      row({ permission: 'pages:read' }),
      emptyRow(),
      row({ permission: 'storage:bucket:read' })
    ]

    expect(rowsToGrants(rows)).toEqual([{ permission: 'pages:read', resource: WILDCARD }])
  })

  it('yields nothing when every row is incomplete', () => {
    // A role granting nothing is a legitimate thing to save; a role granting a guess is not.
    expect(rowsToGrants([emptyRow(), emptyRow()])).toEqual([])
  })
})

describe('the round trip', () => {
  const grants: Grant[] = [
    { permission: 'pages:content_edit', resource: WILDCARD },
    { permission: 'storage:bucket:write', resource: { scope: 'bucket', id: 'media' } },
    { permission: 'storage:bucket:write', resource: { scope: 'bucket', id: 'invoices' } },
    {
      permission: 'db:collection:read',
      resource: { scope: 'collection', id: 'articles' },
      fields: ['title', 'body']
    },
    { permission: 'db:collection:delete', resource: { scope: 'collection', id: 'articles' } }
  ] as Grant[]

  it('returns the same grants when nothing is changed', () => {
    // Opening a role and saving it untouched must not alter what it grants.
    expect(rowsToGrants(grantsToRows(grants))).toEqual(grants)
  })

  it('groups grants sharing a permission into one row, as they were composed', () => {
    const rows = grantsToRows(grants)
    const writeRow = rows.find(entry => entry.permission === 'storage:bucket:write')

    expect(writeRow?.resources).toEqual(['media', 'invoices'])
  })

  it('keeps a wildcard grant in its own row', () => {
    // "Any collection" says something a list of named ones cannot: it covers collections added
    // later. Merging the two would lose that.
    const rows = grantsToRows([
      { permission: 'db:collection:read', resource: WILDCARD },
      { permission: 'db:collection:read', resource: { scope: 'collection', id: 'articles' } }
    ] as Grant[])

    expect(rows).toHaveLength(2)
    expect(rows.filter(entry => entry.anywhere)).toHaveLength(1)
  })

  it('preserves a field restriction across the round trip', () => {
    const restricted: Grant[] = [{
      permission: 'db:collection:write',
      resource: { scope: 'collection', id: 'products' },
      fields: ['name']
    }] as Grant[]

    expect(rowsToGrants(grantsToRows(restricted))).toEqual(restricted)
  })

  it('starts an empty role with one blank row, so there is something to fill in', () => {
    const rows = grantsToRows([])
    expect(rows).toHaveLength(1)
    expect(isIncomplete(rows[0])).toBe(true)
  })
})
