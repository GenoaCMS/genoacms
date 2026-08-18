import { describe, it, expect } from 'vitest'
import { parseDeclarations, mergeDeclarations, declarationsOnly, type Declarations } from './declared'
import { WILDCARD } from './grants'
import type { Role } from './roles'
import type { UserRecord } from './manifests'

/**
 * Tier-1 declarations and their merge.
 *
 * The property that carries the architecture is that **declarations resolve without storage**. It is
 * what replaced the seed administrator: an instance whose `users.json` is absent or unverifiable
 * still has exactly the principals its configuration declares, and nobody else.
 */

const editorGrants = [{ permission: 'pages:content_edit', resource: WILDCARD }]
const adminGrants = [{ permission: WILDCARD, resource: WILDCARD }]

const role = (name: string, grants: unknown = editorGrants): Role =>
  ({ name, grants } as Role)
const user = (subject: string, roles: string[]): UserRecord =>
  ({ subject, email: `${subject}@example.com`, roles })

const unwrap = <T>(result: { ok: true, value: T } | { ok: false, reason: string }): T => {
  if (!result.ok) throw new Error(`expected success, got ${result.reason}`)
  return result.value
}

describe('parsing declarations', () => {
  it('accepts an instance that declares nothing', () => {
    const value = unwrap(parseDeclarations(undefined, undefined))
    expect(value).toEqual({ roles: [], users: [] })
  })

  it('parses roles and assignments', () => {
    const value = unwrap(parseDeclarations(
      { Administrator: adminGrants },
      { 'subject-1': ['Administrator'] }
    ))

    expect(value.roles).toEqual([{ name: 'Administrator', grants: adminGrants }])
    expect(value.users).toEqual([{ subject: 'subject-1', email: '', roles: ['Administrator'] }])
  })

  it('rejects a malformed role rather than skipping it', () => {
    // Configuration an operator wrote deliberately. Ignoring it would leave the instance with less
    // authority than its configuration describes, and nothing to say so.
    const result = parseDeclarations({ Broken: [{ permission: 'not:a:permission', resource: WILDCARD }] }, undefined)
    expect(result).toMatchObject({ ok: false })
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('security.roles')
  })

  it('rejects a malformed assignment', () => {
    const result = parseDeclarations(undefined, { 'subject-1': 'Administrator' })
    expect(result).toMatchObject({ ok: false })
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('security.assignments')
  })

  it('rejects a prototype-polluting role name', () => {
    // Built through JSON.parse, which creates a genuine own property — an object literal would set
    // the prototype instead and never reach the guard, so writing it that way would test nothing.
    const polluting = JSON.parse('{"__proto__": []}')
    expect(parseDeclarations(polluting, undefined).ok).toBe(false)
  })

  it('rejects a prototype-polluting subject', () => {
    const polluting = JSON.parse('{"__proto__": []}')
    expect(parseDeclarations(undefined, polluting).ok).toBe(false)
  })
})

describe('merging declarations over stored state', () => {
  const declared: Declarations = {
    roles: [role('Administrator', adminGrants)],
    users: [user('subject-1', ['Administrator'])]
  }
  const stored: Declarations = {
    roles: [role('Copywriter')],
    users: [user('subject-2', ['Copywriter'])]
  }

  it('keeps both, and records which are declared', () => {
    const merged = mergeDeclarations(declared, stored)

    expect(merged.roles.map(r => r.name)).toEqual(['Administrator', 'Copywriter'])
    expect(merged.users.map(u => u.subject)).toEqual(['subject-1', 'subject-2'])
    expect([...merged.declaredRoleNames]).toEqual(['Administrator'])
    expect([...merged.declaredSubjects]).toEqual(['subject-1'])
  })

  it('discards a stored role that shadows a declared one', () => {
    // Nothing writes such an entry, so finding one means the manifest was edited out of band. It
    // must not be able to dilute a declaration.
    const shadowing: Declarations = { roles: [role('Administrator', [])], users: [] }
    const merged = mergeDeclarations(declared, shadowing)

    expect(merged.roles).toHaveLength(1)
    expect(merged.roles[0].grants).toEqual(adminGrants)
  })

  it('discards a stored assignment that shadows a declared subject', () => {
    const shadowing: Declarations = { roles: [], users: [user('subject-1', [])] }
    const merged = mergeDeclarations(declared, shadowing)

    expect(merged.users).toHaveLength(1)
    expect(merged.users[0].roles).toEqual(['Administrator'])
  })

  it('marks nothing as declared when Tier 1 is silent', () => {
    const merged = mergeDeclarations({ roles: [], users: [] }, stored)

    expect(merged.declaredRoleNames.size).toBe(0)
    expect(merged.declaredSubjects.size).toBe(0)
    expect(merged.roles.map(r => r.name)).toEqual(['Copywriter'])
  })
})

describe('declarations alone', () => {
  it('yields exactly the declared principals, and no others', () => {
    // The recovery property that replaced the seed administrator: an instance whose stored
    // authorization cannot be read still resolves the identities its configuration names.
    const merged = declarationsOnly({
      roles: [role('Administrator', adminGrants)],
      users: [user('subject-1', ['Administrator'])]
    })

    expect(merged.users.map(u => u.subject)).toEqual(['subject-1'])
    expect(merged.roles.map(r => r.name)).toEqual(['Administrator'])
    expect(merged.declaredSubjects.has('subject-1')).toBe(true)
  })

  it('yields nobody when nothing is declared', () => {
    // An instance that declares no assignment and cannot read its manifests has no principal at
    // all — which is the fail-closed outcome, not a lockout to be worked around.
    expect(declarationsOnly({ roles: [], users: [] }).users).toEqual([])
  })
})
