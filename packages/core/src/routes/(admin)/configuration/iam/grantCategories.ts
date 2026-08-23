import { permissions, type Permission } from '$lib/script/authorization/permissions'

/**
 * The permission categories, as an administrator picks them.
 *
 * Twenty-three permissions in one list is a scan, not a choice. Choosing the category first cuts it
 * to a handful, and the category is what an administrator already has in mind — "this role is about
 * pages".
 *
 * **Not the same as the permission domains.** The vocabulary puts pages and components in one
 * `content` domain, which is right for the taxonomy and wrong for this control: they are separate
 * jobs, and a role is rarely about both. The split lives here because it is a presentation
 * judgment, not a change to what the domains mean.
 */
interface GrantCategory {
  id: string
  label: string
  icon: string
  /** Matched by prefix, so a permission added to the vocabulary lands in a category by construction. */
  prefixes: string[]
}

const grantCategories: GrantCategory[] = [
  { id: 'storage', label: 'Storage', icon: 'folder2', prefixes: ['storage:'] },
  { id: 'database', label: 'Database', icon: 'collection', prefixes: ['db:'] },
  { id: 'content', label: 'Content', icon: 'layout-text-window-reverse', prefixes: ['pages:', 'components:'] },
  { id: 'configuration', label: 'Configuration', icon: 'toggles', prefixes: ['config:'] }
]

const categoryById = (id: string): GrantCategory =>
  grantCategories.find(category => category.id === id) ?? grantCategories[0]

const permissionsIn = (id: string): Permission[] => {
  const category = categoryById(id)
  return permissions.filter(permission =>
    category.prefixes.some(prefix => permission.startsWith(prefix))
  )
}

/** The category a chosen permission belongs to, so an existing grant opens on the right tab. */
function categoryOf (permission: Permission | ''): string {
  if (permission === '') return grantCategories[0].id
  const found = grantCategories.find(category =>
    category.prefixes.some(prefix => permission.startsWith(prefix))
  )
  return (found ?? grantCategories[0]).id
}

interface Option {
  permission: Permission
  /** What distinguishes this option from the others beside it. */
  label: string
}

interface OptionGroup {
  /** Absent when the category needs no sub-heading. */
  label?: string
  options: Option[]
}

/**
 * Labels for one group, with the segments every member shares removed.
 *
 * Repeating what the tab and sub-heading already say makes the difference between options harder to
 * see, not easier. Which segments are shared is **derived rather than assumed**: the configuration
 * permissions differ in their middle segment and all end in `manage`, so trimming to the last
 * segment would render five identical options.
 */
function labeled (group: Permission[]): Option[] {
  if (group.length === 0) return []

  const segments = group.map(permission => permission.split(':'))
  let shared = 0
  while (segments.every(parts => parts.length > shared + 1 && parts[shared] === segments[0][shared])) {
    shared += 1
  }

  return group.map((permission, index) => ({
    permission,
    label: segments[index].slice(shared).join(' ').replaceAll('_', ' ')
  }))
}

/**
 * The select options for a category, grouped where the group is meaningful.
 *
 * Content contains both pages and components (prebuilt and dynamic), which are grouped separately.
 */
function optionGroups (id: string): OptionGroup[] {
  const available = permissionsIn(id)
  if (id === 'content') {
    const pages = available.filter(permission => permission.startsWith('pages:'))
    const ofKind = (kind: string): Permission[] =>
      available.filter(permission => permission.startsWith(`components:${kind}:`))

    return [
      { label: 'Pages', options: labeled(pages) },
      { label: 'Prebuilt components', options: labeled(ofKind('prebuilt')) },
      { label: 'Dynamic components', options: labeled(ofKind('dynamic')) }
    ].filter(group => group.options.length > 0)
  }

  return [{ options: labeled(available) }]
}

export {
  grantCategories,
  permissionsIn,
  categoryOf,
  optionGroups
}

export type {
  GrantCategory,
  Option,
  OptionGroup
}
