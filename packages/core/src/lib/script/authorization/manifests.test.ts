import { describe, it, expect } from 'vitest'
import {
  parseRolesManifest,
  parseUsersManifest,
  serializeRolesManifest,
  serializeUsersManifest,
  type UserRecord
} from './manifests'
import { WILDCARD } from './grants'
import type { Role } from './roles'

const rolesManifest = (roles: unknown): unknown => ({ roles })
const usersManifest = (users: unknown): unknown => ({ users })

const validGrant = { permission: 'db:collection:read', resource: { scope: 'collection', id: 'products' } }

describe('parseRolesManifest', () => {
  it('parses a well-formed manifest into roles', () => {
    const result = parseRolesManifest(rolesManifest({
      Editor: [{ permission: 'pages:content_edit', resource: WILDCARD }],
      ProductReader: [validGrant]
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      { name: 'Editor', grants: [{ permission: 'pages:content_edit', resource: WILDCARD }] },
      { name: 'ProductReader', grants: [validGrant] }
    ])
  })

  it('accepts a role with no grants', () => {
    const result = parseRolesManifest(rolesManifest({ Empty: [] }))
    expect(result.ok).toBe(true)
  })

  it('accepts an empty manifest', () => {
    const result = parseRolesManifest(rolesManifest({}))
    expect(result).toEqual({ ok: true, value: [] })
  })

  it('rejects a permission that is not in the permission table', () => {
    // The single most important rejection here: an invented permission must not become a grant.
    const result = parseRolesManifest(rolesManifest({
      Sneaky: [{ permission: 'pages:launch_missiles', resource: WILDCARD }]
    }))
    expect(result.ok).toBe(false)
  })

  it('rejects a permission removed from the table', () => {
    // storage:bucket:manage was dropped; a stale manifest must not resurrect it.
    const result = parseRolesManifest(rolesManifest({
      Stale: [{ permission: 'storage:bucket:manage', resource: WILDCARD }]
    }))
    expect(result.ok).toBe(false)
  })

  it('rejects a named resource missing its scope', () => {
    const result = parseRolesManifest(rolesManifest({
      Ambiguous: [{ permission: WILDCARD, resource: { id: 'products' } }]
    }))
    expect(result.ok).toBe(false)
  })

  it('rejects a bare string resource, which carries no kind', () => {
    const result = parseRolesManifest(rolesManifest({
      Old: [{ permission: WILDCARD, resource: 'products' }]
    }))
    expect(result.ok).toBe(false)
  })

  it('rejects an unknown resource scope', () => {
    const result = parseRolesManifest(rolesManifest({
      Odd: [{ permission: WILDCARD, resource: { scope: 'page', id: 'home' } }]
    }))
    expect(result.ok).toBe(false)
  })

  it('rejects an empty resource id', () => {
    const result = parseRolesManifest(rolesManifest({
      Blank: [{ permission: WILDCARD, resource: { scope: 'bucket', id: '' } }]
    }))
    expect(result.ok).toBe(false)
  })

  it('rejects extra properties smuggled into a grant', () => {
    const result = parseRolesManifest(rolesManifest({
      Extra: [{ permission: 'pages:publish', resource: WILDCARD, superuser: true }]
    }))
    expect(result.ok).toBe(false)
  })

  it.each(['__proto__', 'constructor', 'prototype'])('rejects the unsafe role name %s', (name) => {
    const result = parseRolesManifest(rolesManifest({ [name]: [] }))
    expect(result.ok).toBe(false)
  })

  it.each([null, undefined, 'a string', 42, []])('rejects the non-manifest value %s', (raw) => {
    expect(parseRolesManifest(raw).ok).toBe(false)
  })

  it('rejects a manifest missing the roles key', () => {
    expect(parseRolesManifest({}).ok).toBe(false)
  })

  it('yields no roles at all when one grant is invalid', () => {
    // Fail closed as a whole: salvaging the valid half of a tampered manifest is what an actor
    // with bucket write access would want.
    const result = parseRolesManifest(rolesManifest({
      Good: [{ permission: 'pages:publish', resource: WILDCARD }],
      Bad: [{ permission: 'not:a:permission', resource: WILDCARD }]
    }))
    expect(result.ok).toBe(false)
  })

  it('reports a reason for the operational alert', () => {
    const result = parseRolesManifest(rolesManifest({ Bad: [{ permission: 'nope', resource: WILDCARD }] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('roles-manifest-malformed')
  })
})

describe('parseUsersManifest', () => {
  it('parses users keyed by subject', () => {
    const result = parseUsersManifest(usersManifest({
      'subject-1': { email: 'a@example.com', roles: ['Editor'] }
    }))
    expect(result).toEqual({
      ok: true,
      value: [{ subject: 'subject-1', email: 'a@example.com', roles: ['Editor'] }]
    })
  })

  it('accepts a user with no roles', () => {
    const result = parseUsersManifest(usersManifest({ 'subject-1': { email: 'a@example.com', roles: [] } }))
    expect(result.ok).toBe(true)
  })

  it('rejects a user record without roles', () => {
    const result = parseUsersManifest(usersManifest({ 'subject-1': { email: 'a@example.com' } }))
    expect(result.ok).toBe(false)
  })

  it('rejects grants smuggled onto a user, bypassing roles', () => {
    const result = parseUsersManifest(usersManifest({
      'subject-1': { email: 'a@example.com', roles: [], grants: [{ permission: WILDCARD, resource: WILDCARD }] }
    }))
    expect(result.ok).toBe(false)
  })

  it.each(['__proto__', 'constructor', 'prototype'])('rejects the unsafe subject %s', (subject) => {
    const result = parseUsersManifest(usersManifest({ [subject]: { email: 'a@example.com', roles: [] } }))
    expect(result.ok).toBe(false)
  })

  it.each([null, undefined, 'a string', 42, []])('rejects the non-manifest value %s', (raw) => {
    expect(parseUsersManifest(raw).ok).toBe(false)
  })
})

describe('round trip', () => {
  it('preserves roles through serialize and parse', () => {
    const roles: Role[] = [
      { name: 'Editor', grants: [{ permission: 'pages:content_edit', resource: WILDCARD }] },
      { name: 'ProductReader', grants: [{ permission: 'db:collection:read', resource: { scope: 'collection', id: 'products' } }] }
    ]
    const result = parseRolesManifest(JSON.parse(JSON.stringify(serializeRolesManifest(roles))))
    expect(result).toEqual({ ok: true, value: roles })
  })

  it('preserves users through serialize and parse', () => {
    const users: UserRecord[] = [
      { subject: 'subject-1', email: 'a@example.com', roles: ['Editor'] },
      { subject: 'subject-2', email: 'b@example.com', roles: [] }
    ]
    const result = parseUsersManifest(JSON.parse(JSON.stringify(serializeUsersManifest(users))))
    expect(result).toEqual({ ok: true, value: users })
  })

  it('collapses roles sharing a name rather than storing both', () => {
    const roles: Role[] = [
      { name: 'Editor', grants: [] },
      { name: 'Editor', grants: [{ permission: 'pages:publish', resource: WILDCARD }] }
    ]
    expect(Object.keys(serializeRolesManifest(roles).roles)).toEqual(['Editor'])
  })
})
