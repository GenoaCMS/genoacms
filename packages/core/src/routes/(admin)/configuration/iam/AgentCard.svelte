<script lang="ts">
  import { Card } from '#lib/components/ui/index.js'
  import DeclaredBadge from './DeclaredBadge.svelte'

  interface Agent {
    subject: string
    label: string
    roles: string[]
    declared: boolean
  }

  interface Props {
    agent: Agent
    actions?: import('svelte').Snippet<[Agent]>
  }
  const { agent, actions }: Props = $props()
</script>

<Card class="flex flex-col justify-between h-full overflow-hidden">
  <div>
    <div class="flex items-start justify-between gap-2 mb-3">
      <div class="min-w-0 flex-1">
        <h3 class="font-mono text-xs sm:text-sm break-all font-medium" title={agent.subject}>{agent.subject}</h3>
        <p class="text-xs opacity-70 truncate mt-0.5" title={agent.label}>{agent.label}</p>
      </div>
      {#if agent.declared}
        <DeclaredBadge reason="Declared in genoa.config. Change it there." />
      {/if}
    </div>

    {#if agent.roles.length === 0}
      <p class="text-sm opacity-60">Holds no roles, so it can do nothing.</p>
    {:else}
      <div class="flex flex-wrap gap-1.5 mt-2">
        {#each agent.roles as name (name)}
          <span class="text-xs px-2 py-0.5 rounded preset-tonal-surface border border-surface-200-800 font-medium break-all">{name}</span>
        {/each}
      </div>
    {/if}
  </div>

  {#if !agent.declared && actions}
    <div class="mt-4 pt-3 border-t border-surface-200-800 flex justify-between items-center">
      {@render actions(agent)}
    </div>
  {/if}
</Card>
