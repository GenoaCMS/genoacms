import { describe, it, expect } from 'vitest'
import { emptyRow, isIncomplete, rowToGrant, rowsToGrants, grantsToRows, type GrantRow } from './grantRows'
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

  it('does not start a row applying to every resource', () => {
    // The widest grant the editor can express must be chosen, not defaulted into. A resource-scoped
    // permission on a fresh row is therefore incomplete until a resource is named.
    expect(emptyRow().anywhere).toBe(false)
    expect(isIncomplete(row({ permission: 'db:collection:schema' }))).toBe(true)
  })

  it('treats an instance-scoped permission as complete on its own', () => {
    // There is no resource to name, so nothing further is required.
    expect(isIncomplete(row({ permission: 'pages:read' }))).toBe(false)
  })

  it('treats a resource-scoped permission as complete when it applies anywhere', () => {
    expect(isIncomplete(row({ permission: 'storage:bucket:read', anywhere: true }))).toBe(false)
  })

  it('treats a named resource with no name as incomplete', () => {
    expect(isIncomplete(row({ permission: 'storage:bucket:read', anywhere: false }))).toBe(true)
    expect(isIncomplete(row({ permission: 'storage:bucket:read', anywhere: false, resourceId: '   ' })))
      .toBe(true)
  })
})

describe('a row becoming a grant', () => {
  it('gives an instance-scoped permission the wildcard resource', () => {
    expect(rowToGrant(row({ permission: 'pages:publish' })))
      .toEqual({ permission: 'pages:publish', resource: WILDCARD })
  })

  it('derives the scope from the permission rather than asking for it', () => {
    // The scope is not a choice: storage permissions name buckets, database ones name collections.
    expect(rowToGrant(row({ permission: 'storage:bucket:read', anywhere: false, resourceId: 'media' })))
      .toEqual({ permission: 'storage:bucket:read', resource: { scope: 'bucket', id: 'media' } })

    expect(rowToGrant(row({ permission: 'db:collection:read', anywhere: false, resourceId: 'articles' })))
      .toEqual({ permission: 'db:collection:read', resource: { scope: 'collection', id: 'articles' } })
  })

  it('trims the name, so a stray space does not create an unmatchable grant', () => {
    expect(rowToGrant(row({ permission: 'storage:bucket:read', anywhere: false, resourceId: '  media  ' })))
      .toMatchObject({ resource: { id: 'media' } })
  })

  it('yields nothing for an incomplete row', () => {
    expect(rowToGrant(emptyRow())).toBeUndefined()
    expect(rowToGrant(row({ permission: 'storage:bucket:read', anywhere: false }))).toBeUndefined()
  })
})

describe('collecting rows', () => {
  it('drops incomplete rows rather than submitting them half-formed', () => {
    const rows = [
      row({ permission: 'pages:read' }),
      emptyRow(),
      row({ permission: 'storage:bucket:read', anywhere: false })
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
    { permission: 'db:collection:delete', resource: { scope: 'collection', id: 'articles' } }
  ] as Grant[]

  it('returns the same grants when nothing is changed', () => {
    // Opening a role and saving it untouched must not alter what it grants.
    expect(rowsToGrants(grantsToRows(grants))).toEqual(grants)
  })

  it('starts an empty role with one blank row, so there is something to fill in', () => {
    const rows = grantsToRows([])
    expect(rows).toHaveLength(1)
    expect(isIncomplete(rows[0])).toBe(true)
  })
})
