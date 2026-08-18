<script lang="ts">
  interface Props {
    /** The service's reason, shown verbatim rather than flattened to "something went wrong". */
    reason?: string
  }
  const { reason }: Props = $props()

  /** Reasons an administrator can act on, rather than a bare identifier. */
  const explanations: Record<string, string> = {
    'administration/locked-by-configuration':
      'This instance sets security.lockRoles. Change roles in genoa.config and redeploy.',
    'role/declared-in-configuration':
      'That role is declared in genoa.config. Change it there, not here.',
    'user/declared-in-configuration':
      'That assignment is declared in genoa.config. Change it there, not here.',
    'manifest/conflict':
      'Someone else changed this first. Reload to see the current state, then try again.'
  }
</script>

{#if reason}
  <div class="border border-error-500 rounded p-3 mb-4 text-sm">
    {explanations[reason] ?? reason}
    {#if reason.startsWith('role/in-use')}
      <p class="mt-1 opacity-80">Remove the role from those accounts first.</p>
    {/if}
  </div>
{/if}
