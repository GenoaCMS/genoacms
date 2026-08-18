import { describe, it, expect } from 'vitest'
import { grantCategories, permissionsIn, categoryOf, optionGroups } from './grantCategories'
import { permissions } from '$lib/script/authorization/permissions'

/**
 * The grant editor's categories.
 *
 * The editor only offers the permissions of the chosen category, so a permission belonging to no
 * category would be **unreachable through the interface** — grantable in configuration but
 * impossible to compose here, with nothing to indicate why.
 */

describe('coverage', () => {
  it('reaches every permission exactly once', () => {
    const reached = grantCategories.flatMap(category => permissionsIn(category.id))
    expect([...reached].sort()).toEqual([...permissions].sort())
    expect(new Set(reached).size).toBe(permissions.length)
  })

  it('leaves no category empty', () => {
    // An empty tab is a dead control.
    for (const category of grantCategories) {
      expect({ id: category.id, count: permissionsIn(category.id).length })
        .toEqual({ id: category.id, count: permissionsIn(category.id).length })
      expect(permissionsIn(category.id).length).toBeGreaterThan(0)
    }
  })

  it('groups pages and components under content, matching the domain vocabulary', () => {
    expect(permissionsIn('content').some(p => p.startsWith('pages:'))).toBe(true)
    expect(permissionsIn('content').some(p => p.startsWith('components:'))).toBe(true)
  })
})

describe('categoryOf', () => {
  it('sends every permission back to the category that offers it', () => {
    // Opening an existing grant on the wrong tab clears the permission the moment it renders,
    // silently emptying a row the administrator only meant to look at.
    for (const permission of permissions) {
      expect({ permission, found: permissionsIn(categoryOf(permission)).includes(permission) })
        .toEqual({ permission, found: true })
    }
  })

  it('falls back to a real category for an unchosen row', () => {
    expect(grantCategories.map(c => c.id)).toContain(categoryOf(''))
  })
})

describe('option groups', () => {
  it('splits content by pages and component kind', () => {
    const labels = optionGroups('content').map(group => group.label)
    expect(labels).toEqual(['Pages', 'Prebuilt components', 'Dynamic components'])
  })

  it('covers every permission of the category it groups', () => {
    for (const category of grantCategories) {
      const grouped = optionGroups(category.id).flatMap(group => group.options.map(o => o.permission))
      expect([...grouped].sort()).toEqual([...permissionsIn(category.id)].sort())
    }
  })

  it('leaves other categories ungrouped, with no sub-heading to read past', () => {
    expect(optionGroups('storage').map(g => g.label)).toEqual([undefined])
  })
})

describe('option labels', () => {
  it('drop the segments every option in the group shares', () => {
    const storage = optionGroups('storage')[0].options
    expect(storage.map(o => o.label)).toEqual(['read', 'write', 'delete'])

    const dynamic = optionGroups('content')[2].options
    expect(dynamic.map(o => o.label)).toEqual(['view code', 'edit', 'commit'])
  })

  it('keep the segment that distinguishes, even when it is not the last', () => {
    // Every configuration permission ends in `manage`; trimming to the last segment would render
    // five identical options, which is what this rule exists to prevent.
    const configuration = optionGroups('configuration')[0].options
    expect(configuration.map(o => o.label)).toContain('users manage')
    expect(configuration.map(o => o.label)).toContain('keys manage')
  })

  it('stay distinct within every group', () => {
    for (const category of grantCategories) {
      for (const group of optionGroups(category.id)) {
        const labels = group.options.map(o => o.label)
        expect(new Set(labels).size).toBe(labels.length)
      }
    }
  })

  it('are never empty', () => {
    for (const category of grantCategories) {
      for (const group of optionGroups(category.id)) {
        for (const option of group.options) expect(option.label.length).toBeGreaterThan(0)
      }
    }
  })
})
