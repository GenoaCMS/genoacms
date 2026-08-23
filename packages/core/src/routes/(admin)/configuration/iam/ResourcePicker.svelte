<script lang="ts">
  import { Switch } from '@skeletonlabs/skeleton-svelte'
  import { SwitchList } from '$lib/components/ui/index'
  import FieldPicker from './FieldPicker.svelte'
  import type { ResourceScope, FieldSelector } from '$lib/script/authorization/grants'
  import type { GrantableCollection } from '$lib/script/configuration/resources'

  /**
   * What a resource-scoped grant applies to.
   *
   * A switch per resource, from the instance's actual buckets and collections rather than typed. A
   * typed name that matches nothing produces a grant that is silently never satisfied — it looks
   * granted and denies every request — and nothing in the editor could have told the administrator
   * that, because a grant naming a non-existent resource is not malformed.
   *
   * **Anywhere is offered but is not the default.** A wildcard resource is a legitimate grant and
   * stays expressible, but it is the widest option available, so it is chosen deliberately rather
   * than arrived at by leaving a control alone.
   */
  interface Props {
    /** Fixed by the permission — `storage:bucket:read` is scoped to a bucket and nothing else. */
    scope: ResourceScope
    /** The resources of this scope that exist, from the catalog the server supplied. */
    available: string[]
    /** Collections with their fields, for the field pickers. Empty for bucket-scoped grants. */
    collections: GrantableCollection[]
    /** Whether this permission admits a field selection. */
    selectsFields: boolean
    anywhere: boolean
    selected: string[]
    fieldsOf: (resource: string) => FieldSelector
    onanywhere: (anywhere: boolean) => void
    ontoggle: (resource: string, on: boolean) => void
    onfields: (resource: string, selection: FieldSelector) => void
  }
  const {
    scope, available, collections, selectsFields,
    anywhere, selected, fieldsOf, onanywhere, ontoggle, onfields
  }: Props = $props()

  const fieldsOfCollection = (name: string): string[] =>
    collections.find(collection => collection.name === name)?.fields ?? []
</script>

<div class="space-y-2 pt-1">
  <div class="flex items-center justify-between">
    <span class="text-xs font-semibold uppercase tracking-wider text-surface-500">Applies to</span>
    <Switch
      checked={anywhere}
      onCheckedChange={(e) => onanywhere(e.checked)}
      class="flex items-center gap-2"
    >
      <Switch.Label class="text-xs font-medium">Any {scope}</Switch.Label>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      <Switch.HiddenInput />
    </Switch>
  </div>

  {#if !anywhere}
    <SwitchList
      options={available}
      {selected}
      {ontoggle}
      emptyMessage="This instance has no {scope}s to name. Grant it over any {scope} instead."
    />

    <!-- Fields belong to a collection, so each selected one gets its own picker: a role may read
         every field of one collection and a single field of another. -->
    {#if selectsFields}
      {#each selected as resource (resource)}
        <FieldPicker
          collection={resource}
          available={fieldsOfCollection(resource)}
          selection={fieldsOf(resource)}
          onchange={(selection) => onfields(resource, selection)}
        />
      {/each}
    {/if}
  {/if}
</div>
