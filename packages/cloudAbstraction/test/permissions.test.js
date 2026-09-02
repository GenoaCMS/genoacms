import { describe, it, expect } from 'vitest'
import {
  permissions,
  permissionDefinitions,
  isPermission,
  getPermissionScope,
  getPermissionDomain,
  isResourceScoped,
  getResourceScope,
  getPermissionsByDomain
} from '../src/authorization/permissions.js'

/**
 * The permission vocabulary.
 *
 * This package is plain JavaScript with hand-written declarations, so the runtime table and the
 * `Permission` union in `permissions.d.ts` are two statements of one list. This suite pins the
 * runtime side against a spelled-out list; the core's own `permissions.test.ts` pins the same list
 * from the other end. A permission added to one and not the other therefore fails a test rather
 * than drifting quietly.
 */

const declared = [
  'storage:bucket:read',
  'storage:bucket:write',
  'storage:bucket:delete',
  'db:collection:read',
  'db:collection:write',
  'db:collection:delete',
  'components:read',
  'components:register',
  'components:modify',
  'components:register',
  'components:code',
  'components:code',
  'components:code',
  'pages:read',
  'pages:content_edit',
  'pages:structure_edit',
  'pages:publish',
  'pages:delete',
  'config:users:manage',
  'config:roles:manage',
  'config:keys:manage',
  'config:security:manage',
  'config:adapters:manage'
]

describe('the permission table', () => {
  it('is exactly the declared vocabulary', () => {
    // Spelled out rather than derived, so removing a permission fails here instead of quietly
    // shrinking the expectation along with the implementation.
    expect(new Set(permissions)).toEqual(new Set(declared))
    expect(permissions).toHaveLength(declared.length)
  })

  it('gives every permission a domain and a scope', () => {
    for (const permission of permissions) {
      const definition = permissionDefinitions[permission]
      expect(definition).toBeDefined()
      expect(['storage', 'database', 'content', 'configuration']).toContain(definition.domain)
      expect(['instance', 'bucket', 'collection']).toContain(definition.scope)
    }
  })

  it('partitions every permission into exactly one domain', () => {
    const domains = ['storage', 'database', 'content', 'configuration']
    const grouped = domains.flatMap(domain => getPermissionsByDomain(domain))

    expect(new Set(grouped)).toEqual(new Set(permissions))
    expect(grouped).toHaveLength(permissions.length)
  })
})

describe('isPermission', () => {
  it('accepts every declared permission', () => {
    for (const permission of permissions) expect(isPermission(permission)).toBe(true)
  })

  it('rejects a string that is not one', () => {
    expect(isPermission('pages:launch_missiles')).toBe(false)
  })

  it('rejects a near miss', () => {
    // Configuration and stored manifests are both hand-editable; a typo must not widen into a
    // granted permission.
    expect(isPermission('pages:publish ')).toBe(false)
    expect(isPermission('PAGES:PUBLISH')).toBe(false)
    expect(isPermission('')).toBe(false)
  })

  it('rejects inherited object properties', () => {
    // `'constructor' in permissionDefinitions` is true; own-property lookup is what stops a role
    // granting "constructor" from being mistaken for a permission.
    for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(isPermission(key)).toBe(false)
    }
  })
})

describe('scoping', () => {
  it('scopes storage per bucket and database per collection', () => {
    for (const permission of getPermissionsByDomain('storage')) {
      expect(getPermissionScope(permission)).toBe('bucket')
    }
    for (const permission of getPermissionsByDomain('database')) {
      expect(getPermissionScope(permission)).toBe('collection')
    }
  })

  it('leaves content and configuration unscoped', () => {
    for (const permission of [...getPermissionsByDomain('content'), ...getPermissionsByDomain('configuration')]) {
      expect(getPermissionScope(permission)).toBe('instance')
    }
  })

  it('reports resource scoping consistently with the declared scope', () => {
    for (const permission of permissions) {
      expect(isResourceScoped(permission)).toBe(getPermissionScope(permission) !== 'instance')
    }
  })

  it('narrows a resource-scoped permission, and refuses an instance-scoped one', () => {
    expect(getResourceScope('storage:bucket:read')).toBe('bucket')
    expect(getResourceScope('db:collection:read')).toBe('collection')

    // Unreachable through the types; a runtime backstop rather than a cast that would keep
    // compiling if the taxonomy disagreed.
    expect(() => getResourceScope('pages:read')).toThrow(/permission-scope-mismatch/)
  })

  it('only ever scopes a permission to a resource kind matching its domain', () => {
    for (const permission of permissions) {
      const scope = getPermissionScope(permission)
      if (scope === 'bucket') expect(getPermissionDomain(permission)).toBe('storage')
      if (scope === 'collection') expect(getPermissionDomain(permission)).toBe('database')
    }
  })
})
