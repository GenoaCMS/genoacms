import { describe, it, expect } from 'vitest'
import {
  permissions,
  permissionDefinitions,
  isPermission,
  getPermissionScope,
  getPermissionDomain,
  isResourceScoped,
  getPermissionsByDomain
} from './permissions'

describe('the permission table', () => {
  it('covers every permission named in the access control taxonomy', () => {
    // Spelled out rather than derived from the table, so that dropping a permission fails here
    // instead of quietly shrinking the expectation along with the implementation.
    expect(new Set(permissions)).toEqual(new Set([
      'storage:bucket:read',
      'storage:bucket:write',
      'storage:bucket:delete',
      'db:collection:read',
      'db:collection:write',
      'db:collection:delete',
      'components:prebuilt:read',
      'components:prebuilt:register',
      'components:prebuilt:modify',
      'components:dynamic:manage',
      'components:dynamic:view_code',
      'components:dynamic:edit',
      'components:dynamic:commit',
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
    ]))
  })

  it('declares each permission exactly once across the domain groups', () => {
    expect(permissions).toHaveLength(Object.keys(permissionDefinitions).length)
    expect(new Set(permissions).size).toBe(permissions.length)
  })

  it('partitions every permission into exactly one domain', () => {
    const domains = ['storage', 'database', 'content', 'configuration'] as const
    const grouped = domains.flatMap(domain => getPermissionsByDomain(domain))
    expect(new Set(grouped)).toEqual(new Set(permissions))
    expect(grouped).toHaveLength(permissions.length)
  })
})

describe('isPermission', () => {
  it.each(permissions)('accepts the declared permission %s', (permission) => {
    expect(isPermission(permission)).toBe(true)
  })

  it('rejects a string that is not a permission', () => {
    expect(isPermission('pages:launch_missiles')).toBe(false)
  })

  it('rejects a near miss on a real permission', () => {
    // A stored manifest is hand-editable; a typo must not widen into a granted permission.
    expect(isPermission('pages:publish ')).toBe(false)
    expect(isPermission('PAGES:PUBLISH')).toBe(false)
  })

  it.each([
    'constructor',
    '__proto__',
    'toString',
    'hasOwnProperty'
  ])('rejects the inherited object property %s', (key) => {
    // `key in permissionDefinitions` would be true for these; a role manifest granting
    // "constructor" must not be mistaken for a permission.
    expect(isPermission(key)).toBe(false)
  })

  it('rejects the empty string', () => {
    expect(isPermission('')).toBe(false)
  })
})

describe('scoping', () => {
  it('scopes every storage permission per bucket', () => {
    for (const permission of getPermissionsByDomain('storage')) {
      expect(getPermissionScope(permission)).toBe('bucket')
    }
  })

  it('scopes every database permission per collection', () => {
    for (const permission of getPermissionsByDomain('database')) {
      expect(getPermissionScope(permission)).toBe('collection')
    }
  })

  it('leaves content and configuration permissions unscoped', () => {
    for (const permission of [...getPermissionsByDomain('content'), ...getPermissionsByDomain('configuration')]) {
      expect(getPermissionScope(permission)).toBe('instance')
    }
  })

  it('reports resource scoping consistently with the declared scope', () => {
    for (const permission of permissions) {
      expect(isResourceScoped(permission)).toBe(getPermissionScope(permission) !== 'instance')
    }
  })

  it('only ever scopes a permission to a resource kind matching its domain', () => {
    // A collection-scoped storage permission, or a bucket-scoped database one, would be
    // unresolvable at the call site.
    for (const permission of permissions) {
      const scope = getPermissionScope(permission)
      if (scope === 'bucket') expect(getPermissionDomain(permission)).toBe('storage')
      if (scope === 'collection') expect(getPermissionDomain(permission)).toBe('database')
    }
  })
})
