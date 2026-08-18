import { describe, it, expect } from 'vitest'
import { permissions, isResourceScoped, type Permission } from './permissions'
import { WILDCARD, SUPER_ADMIN_GRANT, grantSatisfies, type Grant, type NamedResource } from './grants'
import { createAuthContext, type AuthContext } from './context'
import { composeGrants, superAdminRole, type Role } from './roles'
import { PermissionDeniedError, hasPermission, requirePermission } from './enforce'

const contextWith = (grants: Grant[]): AuthContext => createAuthContext('subject-1', grants)
const bucket = (id: string): NamedResource => ({ scope: 'bucket', id })
const collection = (id: string): NamedResource => ({ scope: 'collection', id })

/**
 * Checks a permission without the compile-time overloads, supplying a resource exactly when the
 * permission's scope requires one. Used by the tests that sweep the whole permission space.
 */
const check = (context: AuthContext, permission: Permission): boolean => {
  const untyped = hasPermission as (c: AuthContext, p: Permission, r?: string) => boolean
  return isResourceScoped(permission) ? untyped(context, permission, 'resource-1') : untyped(context, permission)
}

const instancePermissions = permissions.filter(permission => !isResourceScoped(permission))
const scopedPermissions = permissions.filter(isResourceScoped)

describe('fail-closed baseline', () => {
  it('denies every permission to a principal with no grants', () => {
    const context = contextWith([])
    for (const permission of permissions) {
      expect(check(context, permission)).toBe(false)
    }
  })

  it('denies a permission the principal was not granted', () => {
    const context = contextWith([{ permission: 'pages:publish', resource: WILDCARD }])
    expect(hasPermission(context, 'pages:delete')).toBe(false)
  })
})

describe('the wildcard grant', () => {
  it('satisfies every permission in the system', () => {
    const context = contextWith([SUPER_ADMIN_GRANT])
    for (const permission of permissions) {
      expect(check(context, permission)).toBe(true)
    }
  })
})

describe('the permission axis', () => {
  it('grants one permission across every resource without granting others', () => {
    const context = contextWith([{ permission: 'storage:bucket:read', resource: WILDCARD }])
    expect(hasPermission(context, 'storage:bucket:read', 'any-bucket')).toBe(true)
    expect(hasPermission(context, 'storage:bucket:read', 'other-bucket')).toBe(true)
    expect(hasPermission(context, 'storage:bucket:write', 'any-bucket')).toBe(false)
  })
})

describe('the resource axis', () => {
  it('confines a resource-specific grant to that resource', () => {
    const context = contextWith([{ permission: 'db:collection:read', resource: collection('products') }])
    expect(hasPermission(context, 'db:collection:read', 'products')).toBe(true)
    expect(hasPermission(context, 'db:collection:read', 'invoices')).toBe(false)
  })

  it('grants every permission over one resource without granting them elsewhere', () => {
    const context = contextWith([{ permission: WILDCARD, resource: collection('products') }])
    expect(hasPermission(context, 'db:collection:read', 'products')).toBe(true)
    expect(hasPermission(context, 'db:collection:delete', 'products')).toBe(true)
    expect(hasPermission(context, 'db:collection:read', 'invoices')).toBe(false)
  })
})

describe('resources of different kinds sharing a name', () => {
  // A bucket and a collection may both be called 'products'. An id alone cannot tell them apart.
  const onProductsCollection = contextWith([{ permission: WILDCARD, resource: collection('products') }])
  const onProductsBucket = contextWith([{ permission: WILDCARD, resource: bucket('products') }])

  it('does not let a collection grant reach a bucket of the same name', () => {
    expect(hasPermission(onProductsCollection, 'db:collection:read', 'products')).toBe(true)
    expect(hasPermission(onProductsCollection, 'storage:bucket:read', 'products')).toBe(false)
  })

  it('does not let a bucket grant reach a collection of the same name', () => {
    expect(hasPermission(onProductsBucket, 'storage:bucket:read', 'products')).toBe(true)
    expect(hasPermission(onProductsBucket, 'db:collection:read', 'products')).toBe(false)
  })

  it('keeps the two grantable independently', () => {
    const both = contextWith([
      { permission: 'db:collection:read', resource: collection('products') },
      { permission: 'storage:bucket:read', resource: bucket('products') }
    ])
    expect(hasPermission(both, 'db:collection:read', 'products')).toBe(true)
    expect(hasPermission(both, 'storage:bucket:read', 'products')).toBe(true)
    expect(hasPermission(both, 'db:collection:write', 'products')).toBe(false)
  })
})

describe('resource-specific grants against instance-scoped permissions', () => {
  // The one way this matcher could silently over-grant.
  it('never satisfies an instance-scoped permission from a resource-specific grant', () => {
    const context = contextWith([{ permission: WILDCARD, resource: collection('products') }])
    for (const permission of instancePermissions) {
      expect(check(context, permission)).toBe(false)
    }
  })

  it('rejects even an exactly-named instance permission granted against a resource', () => {
    const context = contextWith([{ permission: 'pages:publish', resource: collection('products') }])
    expect(hasPermission(context, 'pages:publish')).toBe(false)
  })

  it('satisfies instance-scoped permissions only from a wildcard-resource grant', () => {
    for (const permission of instancePermissions) {
      const context = contextWith([{ permission, resource: WILDCARD }])
      expect(check(context, permission)).toBe(true)
    }
  })
})

describe('grantSatisfies', () => {
  it('ignores a grant for an unrelated permission regardless of resource', () => {
    const grant: Grant = { permission: 'pages:publish', resource: WILDCARD }
    expect(grantSatisfies(grant, 'pages:delete')).toBe(false)
  })

  it('treats a missing resource as unsatisfiable by a resource-specific grant', () => {
    const grant: Grant = { permission: WILDCARD, resource: collection('products') }
    expect(grantSatisfies(grant, 'pages:publish', undefined)).toBe(false)
  })
})

describe('requirePermission', () => {
  it('returns nothing when the permission is held', () => {
    const context = contextWith([SUPER_ADMIN_GRANT])
    expect(requirePermission(context, 'pages:publish')).toBeUndefined()
  })

  it('throws PermissionDeniedError when it is not', () => {
    const context = contextWith([])
    expect(() => requirePermission(context, 'pages:publish')).toThrow(PermissionDeniedError)
  })

  it('reports the subject, permission and resource on the error', () => {
    const context = contextWith([])
    try {
      requirePermission(context, 'db:collection:write', 'invoices')
      expect.unreachable('should have denied')
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionDeniedError)
      const denied = error as PermissionDeniedError
      expect(denied.subject).toBe('subject-1')
      expect(denied.permission).toBe('db:collection:write')
      expect(denied.resource).toBe('invoices')
    }
  })

  it('agrees with hasPermission across the whole permission space', () => {
    const context = contextWith([{ permission: 'storage:bucket:read', resource: bucket('assets') }])
    const untypedRequire = requirePermission as (c: AuthContext, p: Permission, r?: string) => void
    const untypedHas = hasPermission as (c: AuthContext, p: Permission, r?: string) => boolean
    for (const permission of permissions) {
      const resource = isResourceScoped(permission) ? 'assets' : undefined
      let threw = false
      try {
        untypedRequire(context, permission, resource)
      } catch {
        threw = true
      }
      expect(threw).toBe(!untypedHas(context, permission, resource))
    }
  })
})

describe('misuse of a permission check', () => {
  const context = contextWith([SUPER_ADMIN_GRANT])
  const untyped = hasPermission as (c: AuthContext, p: Permission, r?: string) => boolean

  it('rejects a resource-scoped permission checked without a resource', () => {
    // Must not silently widen to "any resource" — that would over-grant against a wildcard holder.
    expect(() => untyped(context, 'db:collection:read')).toThrow(/missing-resource/)
  })

  it('rejects an instance-scoped permission checked with a resource', () => {
    expect(() => untyped(context, 'pages:publish', 'products')).toThrow(/unexpected-resource/)
  })

  it('rejects a wildcard as the demanded resource', () => {
    expect(() => untyped(context, 'db:collection:read', WILDCARD)).toThrow(/wildcard-resource/)
  })

  it('rejects an empty resource', () => {
    expect(() => untyped(context, 'db:collection:read', '')).toThrow(/empty-resource/)
  })

  it('raises a fault rather than a denial, so it cannot be reported as 403', () => {
    try {
      untyped(context, 'db:collection:read')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).not.toBeInstanceOf(PermissionDeniedError)
    }
  })
})

describe('a declared administrator context', () => {
  // What used to be the seed administrator: an ordinary context holding the wildcard grant, now
  // produced by a Tier-1 assignment rather than by a special constructor.
  const context = createAuthContext('admin-subject', [SUPER_ADMIN_GRANT], true)

  it('holds every permission without consulting a manifest', () => {
    for (const permission of permissions) {
      expect(check(context, permission)).toBe(true)
    }
  })

  it('is marked, so recovery mode is distinguishable from ordinary operation', () => {
    expect(context.fromDeclarationsOnly).toBe(true)
    expect(createAuthContext('someone', [SUPER_ADMIN_GRANT]).fromDeclarationsOnly).toBe(false)
  })

  it('is matched by the ordinary grant path, not a short circuit', () => {
    // Emptying the grants must deny; if declared status short-circuited, this would still allow.
    const withoutGrants: AuthContext = { ...context, grants: [] }
    expect(check(withoutGrants, 'config:roles:manage')).toBe(false)
  })
})

describe('composeGrants', () => {
  const editor: Role = { name: 'Editor', grants: [{ permission: 'pages:content_edit', resource: WILDCARD }] }
  const publisher: Role = { name: 'Publisher', grants: [{ permission: 'pages:publish', resource: WILDCARD }] }

  it('unions the grants of several roles', () => {
    const context = contextWith(composeGrants([editor, publisher]))
    expect(hasPermission(context, 'pages:content_edit')).toBe(true)
    expect(hasPermission(context, 'pages:publish')).toBe(true)
    expect(hasPermission(context, 'pages:delete')).toBe(false)
  })

  it('removes exact duplicates so overlapping roles do not inflate the token', () => {
    expect(composeGrants([editor, editor])).toHaveLength(1)
  })

  it('keeps grants that differ only by resource', () => {
    const a: Role = { name: 'A', grants: [{ permission: 'db:collection:read', resource: collection('products') }] }
    const b: Role = { name: 'B', grants: [{ permission: 'db:collection:read', resource: collection('invoices') }] }
    expect(composeGrants([a, b])).toHaveLength(2)
  })

  it('yields nothing for a principal holding no roles', () => {
    expect(composeGrants([])).toEqual([])
  })

  it('gives the SuperAdmin role every permission', () => {
    const context = contextWith(composeGrants([superAdminRole]))
    for (const permission of permissions) {
      expect(check(context, permission)).toBe(true)
    }
  })
})

describe('coverage of the permission space', () => {
  it('exercises both scopes, so neither branch is untested', () => {
    expect(instancePermissions.length).toBeGreaterThan(0)
    expect(scopedPermissions.length).toBeGreaterThan(0)
    expect(instancePermissions.length + scopedPermissions.length).toBe(permissions.length)
  })
})
