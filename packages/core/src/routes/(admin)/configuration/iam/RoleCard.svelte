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

<Card class="flex flex-col justify-between h-full overflow-hidden">
  <div>
    <div class="flex items-start justify-between gap-2 mb-3">
      <h3 class="font-semibold text-base break-words">{role.name}</h3>
      {#if !editable}
        <DeclaredBadge reason="Declared in genoa.config, or administration is locked. Change it there." />
      {/if}
    </div>

    <GrantSummary grants={role.grants} />
  </div>

  {#if editable && actions}
    <div class="mt-4 pt-3 border-t border-surface-200-800 flex justify-between items-center">
      {@render actions(role)}
    </div>
  {/if}
</Card>
