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

<Card>
  <div class="flex items-start justify-between gap-2 mb-2">
    <div class="min-w-0">
      <!-- The subject is the identity permissions attach to; the email is only a label for it. -->
      <h3 class="font-mono text-sm truncate" title={account.subject}>{account.subject}</h3>
      {#if account.email}
        <p class="text-sm opacity-70 truncate">{account.email}</p>
      {/if}
    </div>
    {#if !editable}
      <DeclaredBadge reason="Declared in genoa.config, or administration is locked. Change it there." />
    {/if}
  </div>

  {#if account.roles.length === 0}
    <p class="text-sm opacity-60">Holds no roles, so it can do nothing.</p>
  {:else}
    <ul class="flex flex-wrap gap-1">
      {#each account.roles as name (name)}
        <li class="text-xs px-2 py-0.5 rounded bg-surface-100-900">{name}</li>
      {/each}
    </ul>
  {/if}

  {#if editable && actions}
    <div class="mt-3 flex gap-2 flex-wrap items-center">{@render actions(account)}</div>
  {/if}
</Card>
