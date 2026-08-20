<script lang="ts">
  import type { Grant } from '$lib/script/authorization/grants'

  interface Props {
    grants: Grant[]
  }
  const { grants }: Props = $props()

  /**
   * A field restriction, when there is one.
   *
   * Named explicitly rather than omitted: a grant restricted to two fields and one covering the
   * whole document would otherwise read identically, and the narrower one is the one worth seeing.
   */
  function describeFields (grant: Grant): string {
    if (grant.fields === undefined || grant.fields === '*') return ''
    return ` (fields: ${grant.fields.join(', ')})`
  }

  /** A grant as one line: what it permits, where, and over which fields. */
  function describe (grant: Grant): string {
    const permission = grant.permission === '*' ? 'every permission' : grant.permission
    if (grant.resource === '*') return `${permission} — anywhere`
    return `${permission} — ${grant.resource.scope} ${grant.resource.id}${describeFields(grant)}`
  }
</script>

{#if grants.length === 0}
  <p class="text-sm opacity-60">Grants nothing.</p>
{:else}
  <ul class="text-xs sm:text-sm space-y-1.5 max-h-48 overflow-y-auto pr-1">
    {#each grants as grant, index (index)}
      <li class="font-mono break-all bg-surface-100-900/40 rounded px-2 py-1 border border-surface-200-800/60">
        {describe(grant)}
      </li>
    {/each}
  </ul>
{/if}
