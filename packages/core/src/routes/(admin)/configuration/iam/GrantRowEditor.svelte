<script lang="ts">
  import PermissionPicker from './PermissionPicker.svelte'
  import ResourcePicker from './ResourcePicker.svelte'
  import { isResourceScoped, getResourceScope } from '$lib/script/authorization/permissions'
  import type { ResourceScope, FieldSelector } from '$lib/script/authorization/grants'
  import type { GrantableResources } from '$lib/script/configuration/resources'
  import { rowSelectsFields, fieldsFor, withResource, withoutResource, type GrantRow } from './grantRows'

  /**
   * One row of the grant editor: a permission, and what it applies to.
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
  const collections = $derived(resources.collections)

  /** The catalog for the scope the chosen permission fixes. */
  const available = $derived(
    scope === 'bucket' ? resources.buckets : collections.map(collection => collection.name)
  )

  /**
   * Changing the permission can change the *kind* of resource the grant names, and a bucket name
   * left behind in a collection grant would be a resource that does not exist. The selection is
   * therefore cleared whenever the scope it belonged to is no longer the one in force.
   */
  function choosePermission (next: GrantRow['permission']): void {
    if (scopeOf(next) !== scopeOf(row.permission)) {
      row.resources = []
      row.fields = {}
    }
    row.permission = next
  }

  function toggleResource (resource: string, on: boolean): void {
    // The row is bound, so its fields are assigned rather than the binding replaced.
    const next = on ? withResource(row, resource) : withoutResource(row, resource)
    row.resources = next.resources
    row.fields = next.fields
  }

  function chooseFields (resource: string, selection: FieldSelector): void {
    row.fields = { ...row.fields, [resource]: selection }
  }
</script>

<div class="card preset-filled-surface-50-950 border border-surface-200-800 space-y-3 p-3">
  <PermissionPicker permission={row.permission} onselect={choosePermission} />

  {#if scope !== undefined}
    <ResourcePicker
      {scope}
      {available}
      {collections}
      selectsFields={rowSelectsFields(row)}
      anywhere={row.anywhere}
      selected={row.resources}
      fieldsOf={(resource) => fieldsFor(row, resource)}
      onanywhere={(anywhere) => { row.anywhere = anywhere }}
      ontoggle={toggleResource}
      onfields={chooseFields}
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
