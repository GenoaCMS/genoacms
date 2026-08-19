<script lang="ts">
  import PermissionPicker from './PermissionPicker.svelte'
  import ResourcePicker from './ResourcePicker.svelte'
  import { isResourceScoped, getResourceScope } from '$lib/script/authorization/permissions'
  import type { ResourceScope } from '$lib/script/authorization/grants'
  import type { GrantableResources } from '$lib/script/configuration/resources'
  import type { GrantRow } from './grantRows'

  /**
   * One grant, as the two decisions it records: which permission, and what it applies to.
   *
   * Each decision is its own component; this composes them and owns nothing but the row.
   */
  interface Props {
    row: GrantRow
    /** The buckets and collections a resource-scoped grant may name. */
    resources: GrantableResources
    onremove: () => void
  }
  const { row = $bindable(), resources, onremove }: Props = $props()

  /** The kind of resource a permission names, or `undefined` when it names none. */
  const scopeOf = (permission: GrantRow['permission']): ResourceScope | undefined =>
    permission !== '' && isResourceScoped(permission) ? getResourceScope(permission) : undefined

  const scope = $derived(scopeOf(row.permission))

  /** The catalogue for the scope the chosen permission fixes. */
  const available = $derived(scope === 'bucket' ? resources.buckets : resources.collections)

  /**
   * Changing the permission can change the *kind* of resource the grant names, and a bucket name
   * left behind in a collection grant would be a resource that does not exist. The name is
   * therefore cleared whenever the scope it belonged to is no longer the one in force.
   */
  function choosePermission (next: GrantRow['permission']): void {
    if (scopeOf(next) !== scopeOf(row.permission)) row.resourceId = ''
    row.permission = next
  }
</script>

<div class="card preset-filled-surface-50-950 border border-surface-200-800 space-y-3 p-3">
  <PermissionPicker permission={row.permission} onselect={choosePermission} />

  {#if scope !== undefined}
    <ResourcePicker
      {scope}
      {available}
      anywhere={row.anywhere}
      resourceId={row.resourceId}
      onanywhere={(anywhere) => { row.anywhere = anywhere }}
      onselect={(resourceId) => { row.resourceId = resourceId }}
    />
  {/if}

  <div class="flex justify-end border-t border-surface-200-800 pt-2">
    <button
      type="button"
      class="flex items-center px-2 cursor-pointer"
      onclick={onremove}
      title="Remove grant"
      aria-label="Remove grant"
    >
      <i class="bi bi-trash text-xl text-error-500 hover:text-error-600 transition-all"></i>
    </button>
  </div>
</div>
