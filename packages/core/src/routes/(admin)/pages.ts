import type { PermissionDemand } from '$lib/script/authorization/gate'

interface AdminPage {
  name: string
  route: string
  icon: string
  /**
   * What makes this destination useful.
   *
   * Navigation is hidden without it — cosmetically. Every page behind these links resolves its own
   * context and is refused independently, so a typed URL reaches a denial rather than the page.
   *
   * Instance-scoped permissions only: a resource-scoped one would need a resource to check against,
   * and navigation names a section rather than a bucket.
   *
   * `anyOf` is for a section that is an **index** of others, each gated in turn behind it. It is
   * never right for a link to a single operation, where any-of would offer a page certain to refuse.
   */
  permission?: PermissionDemand
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
    // An index over sections governed by different permissions. Demanding both would hide it from
    // every administrator who is not both; the cards inside are gated one by one.
    name: 'Configuration',
    route: '/configuration',
    icon: 'toggles',
    permission: { anyOf: ['config:roles:manage', 'config:keys:manage'] }
  }
]
