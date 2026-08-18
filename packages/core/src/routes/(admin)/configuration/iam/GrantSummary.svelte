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
  <ul class="text-sm space-y-1">
    {#each grants as grant, index (index)}
      <li class="font-mono">{describe(grant)}</li>
    {/each}
  </ul>
{/if}
