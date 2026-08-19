<script lang="ts">
  import { Combobox } from '$lib/components/ui/index'
  import type { ResourceScope } from '$lib/script/authorization/grants'

  /**
   * Choosing *what* a resource-scoped grant applies to.
   *
   * The resource is picked from the instance's actual buckets or collections rather than typed. A
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
    /** The resources of this scope that exist, from the catalogue the server supplied. */
    available: string[]
    anywhere: boolean
    resourceId: string
    onanywhere: (anywhere: boolean) => void
    onselect: (resourceId: string) => void
  }
  const { scope, available, anywhere, resourceId, onanywhere, onselect }: Props = $props()

  const items = $derived(available.map(name => ({ label: name, value: name })))
  const noneExist = $derived(available.length === 0)
</script>

<div class="space-y-2 pt-1">
  <div class="flex items-center justify-between">
    <span class="text-xs font-semibold uppercase tracking-wider text-surface-500">Applies to</span>
    <label class="flex items-center space-x-2 text-xs font-medium cursor-pointer">
      <input
        type="checkbox"
        class="checkbox"
        checked={anywhere}
        onchange={(event) => onanywhere(event.currentTarget.checked)}
      />
      <span>Any {scope}</span>
    </label>
  </div>

  <Combobox
    {items}
    value={anywhere ? '' : resourceId}
    {onselect}
    disabled={anywhere}
    placeholder={anywhere ? `Applies to all ${scope}s` : `Select ${scope}...`}
    emptyMessage="No {scope}s exist yet"
  />

  {#if noneExist && !anywhere}
    <!-- The collection list is read at startup, so one created since is absent until restart. Saying
         so is better than an empty list that reads as "this instance has none". -->
    <p class="text-xs opacity-60">
      This instance has no {scope}s to name. Grant it over any {scope}, or add one first.
    </p>
  {/if}
</div>
