import type { Permission } from '$lib/script/authorization/permissions'

interface AdminPage {
  name: string
  route: string
  icon: string
  /**
   * The permission that makes this destination useful.
   *
   * Navigation is hidden without it — cosmetically. Every page behind these links resolves its own
   * context and is refused independently, so a typed URL reaches a denial rather than the page.
   *
   * Instance-scoped permissions only: a resource-scoped one would need a resource to check against,
   * and navigation names a section rather than a bucket.
   */
  permission?: Permission
}

export const pages: AdminPage[] = [
  {
    name: 'Dashboard',
    route: '/dashboard',
    icon: 'columns'
  },
  {
    name: 'Components',
    route: '/components',
    icon: 'bricks',
    permission: 'pages:read'
  },
  {
    // No permission: db:collection:read is scoped to a collection, and the listing already narrows
    // itself to the ones this principal may read. Hiding the section entirely would need a
    // "holds it anywhere" question the vocabulary does not express.
    name: 'Collections',
    route: '/collections',
    icon: 'collection'
  },
  {
    // As above: storage:bucket:read names a bucket, and the bucket list is already filtered.
    name: 'Storage',
    route: '/storage',
    icon: 'folder2'
  },
  {
    name: 'Configuration',
    route: '/configuration',
    icon: 'toggles',
    permission: 'config:roles:manage'
  }
]
