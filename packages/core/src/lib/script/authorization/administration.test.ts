import { describe, it, expect } from 'vitest'
import {
  addRole,
  replaceRole,
  removeRole,
  upsertUser,
  setUserRoles,
  removeUser,
  holdersOf
} from './administration'
import { SUPER_ADMIN_ROLE_NAME, type Role } from './roles'
import { WILDCARD } from './grants'
import type { UserRecord } from './manifests'

/**
 * The rules that govern the authorization data itself.
 *
 * The invariant under test throughout is **referential integrity**: no operation may leave a user
 * naming a role that does not exist. Reading tolerates a dangling reference — refusing at read time
 * would be a lockout — so writing is the only place it can be prevented, and every path that could
 * introduce one is checked here.
 */

const editor: Role = { name: 'Editor', grants: [{ permission: 'pages:content_edit', resource: WILDCARD }] }
const designer: Role = { name: 'Designer', grants: [{ permission: 'pages:structure_edit', resource: WILDCARD }] }
const superAdmin: Role = { name: SUPER_ADMIN_ROLE_NAME, grants: [{ permission: WILDCARD, resource: WILDCARD }] }

const roles = (): Role[] => [superAdmin, editor]
const user = (subject: string, names: string[]): UserRecord =>
  ({ subject, email: `${subject}@example.com`, roles: names })

const unwrap = <T>(result: { ok: true, value: T } | { ok: false, reason: string }): T => {
  if (!result.ok) throw new Error(`expected success, got ${result.reason}`)
  return result.value
}

describe('adding a role', () => {
  it('appends it', () => {
    const value = unwrap(addRole(roles(), designer))
    expect(value.map(role => role.name)).toEqual([SUPER_ADMIN_ROLE_NAME, 'Editor', 'Designer'])
  })

  it('refuses a duplicate name', () => {
    // Names are the identity a user record references; two roles sharing one makes the reference
    // ambiguous and the composed grants unpredictable.
    expect(addRole(roles(), { ...designer, name: 'Editor' })).toMatchObject({ ok: false })
  })

  it('refuses an empty name', () => {
    expect(addRole(roles(), { ...designer, name: '' })).toMatchObject({ ok: false })
  })

  it('does not mutate the input', () => {
    const original = roles()
    addRole(original, designer)
    expect(original).toHaveLength(2)
  })
})

describe('replacing a role', () => {
  it('swaps its grants', () => {
    const narrowed: Role = { name: 'Editor', grants: [] }
    const value = unwrap(replaceRole(roles(), narrowed))
    expect(value.find(role => role.name === 'Editor')?.grants).toEqual([])
  })

  it('refuses an unknown role', () => {
    expect(replaceRole(roles(), designer)).toMatchObject({ ok: false, reason: 'role/not-found' })
  })

  it('refuses to alter SuperAdmin', () => {
    // Narrowing it could leave the instance with no principal holding full authority, recoverable
    // only through the seed administrator — which is a recovery path, not a management strategy.
    const narrowed: Role = { name: SUPER_ADMIN_ROLE_NAME, grants: [] }
    expect(replaceRole(roles(), narrowed)).toMatchObject({ ok: false, reason: 'role/super-admin-immutable' })
  })
})

describe('removing a role', () => {
  it('removes one nobody holds', () => {
    const value = unwrap(removeRole(roles(), [user('s-1', [])], 'Editor'))
    expect(value.map(role => role.name)).toEqual([SUPER_ADMIN_ROLE_NAME])
  })

  it('refuses while a user still holds it', () => {
    // Cascading would narrow someone's authority as a side effect of an unrelated action, with
    // nothing recording whose.
    const result = removeRole(roles(), [user('s-1', ['Editor'])], 'Editor')
    expect(result).toMatchObject({ ok: false })
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('s-1')
  })

  it('names every holder, not just the first', () => {
    const users = [user('s-1', ['Editor']), user('s-2', ['Editor'])]
    const result = removeRole(roles(), users, 'Editor')
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('s-1')
    expect(result.reason).toContain('s-2')
  })

  it('refuses to remove SuperAdmin', () => {
    expect(removeRole(roles(), [], SUPER_ADMIN_ROLE_NAME))
      .toMatchObject({ ok: false, reason: 'role/super-admin-immutable' })
  })

  it('refuses an unknown role', () => {
    expect(removeRole(roles(), [], 'Nonexistent')).toMatchObject({ ok: false, reason: 'role/not-found' })
  })
})

describe('adding and updating users', () => {
  it('adds a user holding known roles', () => {
    const value = unwrap(upsertUser([], roles(), user('s-1', ['Editor'])))
    expect(value).toHaveLength(1)
  })

  it('replaces the record for a subject already present', () => {
    const existing = [user('s-1', ['Editor'])]
    const value = unwrap(upsertUser(existing, roles(), user('s-1', [])))
    expect(value).toHaveLength(1)
    expect(value[0].roles).toEqual([])
  })

  it('refuses a role that does not exist', () => {
    // The reference would dangle, and resolution would silently grant less than the record claims.
    const result = upsertUser([], roles(), user('s-1', ['Designer']))
    expect(result).toMatchObject({ ok: false })
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('Designer')
  })

  it('refuses a duplicated role in one record', () => {
    expect(upsertUser([], roles(), user('s-1', ['Editor', 'Editor']))).toMatchObject({ ok: false })
  })

  it('refuses an empty subject', () => {
    expect(upsertUser([], roles(), user('', []))).toMatchObject({ ok: false })
  })
})

describe('setting a user\'s roles', () => {
  it('replaces the whole assignment', () => {
    const users = [user('s-1', ['Editor'])]
    const value = unwrap(setUserRoles(users, [...roles(), designer], 's-1', ['Designer']))
    expect(value[0].roles).toEqual(['Designer'])
  })

  it('refuses an unknown user', () => {
    expect(setUserRoles([], roles(), 's-1', [])).toMatchObject({ ok: false, reason: 'user/not-found' })
  })

  it('refuses an unknown role', () => {
    const users = [user('s-1', ['Editor'])]
    expect(setUserRoles(users, roles(), 's-1', ['Designer'])).toMatchObject({ ok: false })
  })

  it('leaves the assignment untouched when it refuses', () => {
    const users = [user('s-1', ['Editor'])]
    setUserRoles(users, roles(), 's-1', ['Designer'])
    expect(users[0].roles).toEqual(['Editor'])
  })
})

describe('removing a user', () => {
  it('removes them', () => {
    expect(unwrap(removeUser([user('s-1', [])], 's-1'))).toEqual([])
  })

  it('refuses an unknown subject', () => {
    expect(removeUser([], 's-1')).toMatchObject({ ok: false, reason: 'user/not-found' })
  })

  it('allows removing the last administrator', () => {
    // Deliberately permitted: the Tier-1 seed administrator resolves without these manifests, so an
    // instance cannot be locked out by emptying them. A last-admin rule would guard against
    // something the architecture already prevents.
    const admins = [user('s-1', [SUPER_ADMIN_ROLE_NAME])]
    expect(unwrap(removeUser(admins, 's-1'))).toEqual([])
  })
})

describe('holdersOf', () => {
  it('names the users holding a role', () => {
    const users = [user('s-1', ['Editor']), user('s-2', ['Designer']), user('s-3', ['Editor'])]
    expect(holdersOf(users, 'Editor')).toEqual(['s-1', 's-3'])
  })

  it('is empty when nobody holds it', () => {
    expect(holdersOf([user('s-1', ['Editor'])], 'Designer')).toEqual([])
  })
})
