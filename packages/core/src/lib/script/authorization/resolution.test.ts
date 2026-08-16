import { describe, it, expect } from 'vitest'
import { resolveRoles, resolveSubject, type AuthorizationSource } from './resolution'
import { WILDCARD } from './grants'
import { hasPermission } from './enforce'
import { permissions, isResourceScoped, type Permission } from './permissions'
import type { AuthContext } from './context'
import type { Role } from './roles'
import type { UserRecord } from './manifests'

const editor: Role = { name: 'Editor', grants: [{ permission: 'pages:content_edit', resource: WILDCARD }] }
const publisher: Role = { name: 'Publisher', grants: [{ permission: 'pages:publish', resource: WILDCARD }] }

const available = (roles: Role[], users: UserRecord[]): AuthorizationSource =>
  ({ available: true, roles, users })
const unavailable: AuthorizationSource = { available: false, reason: 'manifest-unreadable' }

const user = (subject: string, roles: string[]): UserRecord =>
  ({ subject, email: `${subject}@example.com`, roles })

/** Checks a permission without the compile-time overloads, naming a resource only when required. */
const check = (context: AuthContext, permission: Permission): boolean => {
  const untyped = hasPermission as (c: AuthContext, p: Permission, r?: string) => boolean
  return isResourceScoped(permission) ? untyped(context, permission, 'resource-1') : untyped(context, permission)
}

const holdsEvery = (context: AuthContext): boolean => permissions.every(p => check(context, p))
const holdsNone = (context: AuthContext): boolean => permissions.every(p => !check(context, p))

describe('resolveRoles', () => {
  it('resolves names to roles, preserving order', () => {
    const { resolved, missing } = resolveRoles([editor, publisher], ['Publisher', 'Editor'])
    expect(resolved).toEqual([publisher, editor])
    expect(missing).toEqual([])
  })

  it('separates names that resolve to nothing', () => {
    const { resolved, missing } = resolveRoles([editor], ['Editor', 'Deleted'])
    expect(resolved).toEqual([editor])
    expect(missing).toEqual(['Deleted'])
  })
})

describe('resolving a known user', () => {
  const source = available([editor, publisher], [user('subject-1', ['Editor'])])

  it('grants the permissions of the roles it holds', () => {
    const { context } = resolveSubject('subject-1', false, source)
    expect(hasPermission(context, 'pages:content_edit')).toBe(true)
  })

  it('grants nothing beyond them', () => {
    const { context } = resolveSubject('subject-1', false, source)
    expect(hasPermission(context, 'pages:publish')).toBe(false)
    expect(hasPermission(context, 'config:roles:manage')).toBe(false)
  })

  it('unions several roles', () => {
    const both = available([editor, publisher], [user('subject-1', ['Editor', 'Publisher'])])
    const { context } = resolveSubject('subject-1', false, both)
    expect(hasPermission(context, 'pages:content_edit')).toBe(true)
    expect(hasPermission(context, 'pages:publish')).toBe(true)
  })

  it('is known, and reports nothing', () => {
    const resolution = resolveSubject('subject-1', false, source)
    expect(resolution.known).toBe(true)
    expect(resolution.warnings).toEqual([])
  })

  it('admits a user holding no roles, granting them nothing', () => {
    const source = available([editor], [user('subject-1', [])])
    const resolution = resolveSubject('subject-1', false, source)
    expect(resolution.known).toBe(true)
    expect(holdsNone(resolution.context)).toBe(true)
  })
})

describe('a dangling role reference', () => {
  const source = available([editor], [user('subject-1', ['Editor', 'Deleted'])])

  it('keeps the roles that do resolve', () => {
    const { context } = resolveSubject('subject-1', false, source)
    expect(hasPermission(context, 'pages:content_edit')).toBe(true)
  })

  it('contributes no grants of its own', () => {
    const onlyDangling = available([editor], [user('subject-1', ['Deleted'])])
    const { context } = resolveSubject('subject-1', false, onlyDangling)
    expect(context.grants).toEqual([])
  })

  it('names the missing role in a warning', () => {
    const { warnings } = resolveSubject('subject-1', false, source)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Deleted')
  })
})

describe('an unknown subject', () => {
  const source = available([editor], [user('subject-1', ['Editor'])])

  it('resolves to no grants', () => {
    const { context } = resolveSubject('stranger', false, source)
    expect(context.grants).toEqual([])
  })

  it('is not a known principal', () => {
    expect(resolveSubject('stranger', false, source).known).toBe(false)
  })
})

describe('fail closed when authorization data is unavailable', () => {
  it('denies every permission to an ordinary subject', () => {
    const { context } = resolveSubject('subject-1', false, unavailable)
    expect(context.grants).toEqual([])
  })

  it('does not treat the subject as known', () => {
    expect(resolveSubject('subject-1', false, unavailable).known).toBe(false)
  })

  it('reports the reason for the alert', () => {
    const { warnings } = resolveSubject('subject-1', false, unavailable)
    expect(warnings.join()).toContain('manifest-unreadable')
  })

  it('still admits the seed administrator, with full authority', () => {
    // The direction that matters: denial alone would also pass against code that denies everyone.
    const resolution = resolveSubject('admin', true, unavailable)
    expect(resolution.known).toBe(true)
    expect(resolution.context.isSeedAdmin).toBe(true)
    expect(holdsEvery(resolution.context)).toBe(true)
  })
})

describe('the seed administrator', () => {
  it('holds full authority even when the data is healthy but omits them', () => {
    const source = available([editor], [user('someone-else', ['Editor'])])
    const resolution = resolveSubject('admin', true, source)
    expect(resolution.context.isSeedAdmin).toBe(true)
    expect(resolution.known).toBe(true)
  })

  it('is not shadowed by a stored record for the same subject', () => {
    // A user record must not be able to reduce the configured seed authority.
    const source = available([editor], [user('admin', [])])
    const { context } = resolveSubject('admin', true, source)
    expect(holdsEvery(context)).toBe(true)
  })

  it('is marked so recovery mode is reportable', () => {
    expect(resolveSubject('admin', true, unavailable).context.isSeedAdmin).toBe(true)
    expect(resolveSubject('subject-1', false, available([], [user('subject-1', [])])).context.isSeedAdmin).toBe(false)
  })
})
