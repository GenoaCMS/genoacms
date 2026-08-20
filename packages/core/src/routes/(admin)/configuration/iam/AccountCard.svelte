<script lang="ts">
  import { Card } from '$lib/components/ui/index'
  import DeclaredBadge from './DeclaredBadge.svelte'
  import type { UserRecord } from '$lib/script/authorization/manifests'

  interface Props {
    account: UserRecord
    editable: boolean
    actions?: import('svelte').Snippet<[UserRecord]>
  }
  const { account, editable, actions }: Props = $props()
</script>

<Card class="flex flex-col justify-between h-full overflow-hidden">
  <div>
    <div class="flex items-start justify-between gap-2 mb-3">
      <div class="min-w-0 flex-1">
        <!-- The subject is the identity permissions attach to; the email is only a label for it. -->
        <h3 class="font-mono text-xs sm:text-sm break-all font-medium" title={account.subject}>{account.subject}</h3>
        {#if account.email}
          <p class="text-xs opacity-70 truncate mt-0.5" title={account.email}>{account.email}</p>
        {/if}
      </div>
      {#if !editable}
        <DeclaredBadge reason="Declared in genoa.config, or administration is locked. Change it there." />
      {/if}
    </div>

    {#if account.roles.length === 0}
      <p class="text-sm opacity-60">Holds no roles, so it can do nothing.</p>
    {:else}
      <div class="flex flex-wrap gap-1.5 mt-2">
        {#each account.roles as name (name)}
          <span class="text-xs px-2 py-0.5 rounded preset-tonal-surface border border-surface-200-800 font-medium break-all">{name}</span>
        {/each}
      </div>
    {/if}
  </div>

  {#if editable && actions}
    <div class="mt-4 pt-3 border-t border-surface-200-800 flex justify-between items-center">
      {@render actions(account)}
    </div>
  {/if}
</Card>
