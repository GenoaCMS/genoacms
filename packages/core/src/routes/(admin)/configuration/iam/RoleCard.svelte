<script lang="ts">
  import { Card } from '$lib/components/ui/index'
  import GrantSummary from './GrantSummary.svelte'
  import DeclaredBadge from './DeclaredBadge.svelte'
  import type { Role } from '$lib/script/authorization/roles'

  interface Props {
    role: Role
    editable: boolean
    /** Rendered only when the role can be changed, so the page owns the actions and this owns the shape. */
    actions?: import('svelte').Snippet<[Role]>
  }
  const { role, editable, actions }: Props = $props()
</script>

<Card>
  <div class="flex items-start justify-between gap-2 mb-2">
    <h3 class="font-semibold">{role.name}</h3>
    {#if !editable}
      <DeclaredBadge reason="Declared in genoa.config, or administration is locked. Change it there." />
    {/if}
  </div>

  <GrantSummary grants={role.grants} />

  {#if editable && actions}
    <div class="mt-3 flex gap-2">{@render actions(role)}</div>
  {/if}
</Card>
