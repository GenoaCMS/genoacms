import { describe, it, expect } from 'vitest'
import { pages } from './pages'
import { demandedPermissions } from '$lib/script/authorization/gate'
import { isPermission, isResourceScoped } from '$lib/script/authorization/permissions'

/**
 * Navigation gating.
 *
 * `PermissionGate` checks a navigation permission **without a resource**, because navigation names
 * a section rather than a bucket or a collection. A resource-scoped permission checked that way is
 * a programming error: the gate now fails closed rather than throwing, so the mistake would show up
 * as a menu entry silently missing instead of as an error — which is exactly the kind of thing that
 * survives to production unnoticed.
 *
 * An entry may demand one permission, all of several, or — for a section that is an index of
 * others — any of several. Every name in whichever form is subject to the same two rules, so they
 * are flattened through the gate's own helper rather than assumed to be a bare string.
 */

describe('navigation permissions', () => {
  const named = pages
    .filter(page => page.permission !== undefined)
    .flatMap(page => demandedPermissions(page.permission as never).map(permission => ({
      route: page.route,
      permission
    })))

  it('names permissions that exist', () => {
    for (const { route, permission } of named) {
      expect({ route, exists: isPermission(permission) }).toEqual({ route, exists: true })
    }
  })

  it('names only instance-scoped permissions', () => {
    for (const { route, permission } of named) {
      expect({ route, scoped: isResourceScoped(permission) }).toEqual({ route, scoped: false })
    }
  })

  it('gates something, so the mechanism is exercised at all', () => {
    // Guards against the gating quietly disappearing from every entry.
    expect(named.length).toBeGreaterThan(0)
  })
})
