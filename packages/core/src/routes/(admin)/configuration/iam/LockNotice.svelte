<script lang="ts">
  interface Props {
    locked: boolean
  }
  const { locked }: Props = $props()
</script>

{#if locked}
  <div class="border border-warning-500 rounded p-3 mb-4 text-sm">
    <strong><i class="bi bi-lock-fill"></i> Administration is locked.</strong>
    This instance sets <code>authorization.lockRoles</code>, so roles and assignments can only be changed
    in <code>genoa.config</code> and redeployed. Everything below is shown as it stands.
  </div>
{/if}
