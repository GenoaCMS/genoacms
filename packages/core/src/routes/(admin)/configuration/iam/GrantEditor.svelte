<script lang="ts">
  import GrantRowEditor from './GrantRowEditor.svelte'
  import { emptyRow, grantsToRows, rowsToGrants } from './grantRows'
  import type { Grant } from '$lib/script/authorization/grants'
  import type { GrantableResources } from '$lib/script/configuration/resources'

  interface Props {
    /** Existing grants to edit. Empty when composing a new role. */
    grants?: Grant[]
    /** The buckets and collections a resource-scoped grant may name. */
    resources: GrantableResources
  }
  const { grants = [], resources }: Props = $props()

  let rows = $state(grantsToRows(grants))

  /**
   * The form submits JSON, so the server contract is unchanged and this stays a presentation
   * concern. The value is derived from the rows rather than maintained alongside them, so the two
   * cannot drift apart.
   */
  const serialized = $derived(JSON.stringify(rowsToGrants(rows)))
  const dropped = $derived(rows.length - rowsToGrants(rows).length)
</script>

<input type="hidden" name="grants" value={serialized} />

<div class="space-y-2">
  {#each rows as _row, index (index)}
    <GrantRowEditor
      bind:row={rows[index]}
      {resources}
      onremove={() => { rows = rows.filter((_, at) => at !== index) }}
    />
  {/each}
</div>

<div class="flex flex-wrap items-center justify-between gap-2 pt-2">
  <button type="button" class="btn btn-sm preset-tonal" onclick={() => { rows = [...rows, emptyRow()] }}>
    <i class="bi bi-plus-lg"></i>
    <span>Add grant</span>
  </button>

  {#if dropped > 0}
    <p class="text-xs opacity-60">
      {dropped} incomplete {dropped === 1 ? 'row' : 'rows'} will not be saved.
    </p>
  {:else if rows.length === 0}
    <p class="text-xs opacity-60">This role will grant nothing.</p>
  {/if}
</div>
