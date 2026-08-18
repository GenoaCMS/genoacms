import { describe, it, expect } from 'vitest'
import { pages } from './pages'
import { isPermission, isResourceScoped } from '$lib/script/authorization/permissions'

/**
 * Navigation gating.
 *
 * `PermissionGate` checks a navigation permission **without a resource**, because navigation names
 * a section rather than a bucket or a collection. A resource-scoped permission checked that way is
 * a programming error: the gate now fails closed rather than throwing, so the mistake would show up
 * as a menu entry silently missing instead of as an error — which is exactly the kind of thing that
 * survives to production unnoticed.
 */

describe('navigation permissions', () => {
  const gated = pages.filter(page => page.permission !== undefined)

  it('names permissions that exist', () => {
    for (const page of gated) {
      expect(isPermission(page.permission as string)).toBe(true)
    }
  })

  it('names only instance-scoped permissions', () => {
    for (const page of gated) {
      expect({ route: page.route, scoped: isResourceScoped(page.permission as never) })
        .toEqual({ route: page.route, scoped: false })
    }
  })

  it('gates something, so the mechanism is exercised at all', () => {
    // Guards against the gating quietly disappearing from every entry.
    expect(gated.length).toBeGreaterThan(0)
  })
})
