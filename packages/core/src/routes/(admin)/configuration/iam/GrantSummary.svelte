<script lang="ts">
  import type { Grant } from '$lib/script/authorization/grants'

  interface Props {
    grants: Grant[]
  }
  const { grants }: Props = $props()

  /** A grant as one line: what it permits, and where. */
  function describe (grant: Grant): string {
    const permission = grant.permission === '*' ? 'every permission' : grant.permission
    if (grant.resource === '*') return `${permission} — anywhere`
    return `${permission} — ${grant.resource.scope} ${grant.resource.id}`
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
