<script lang="ts">
  interface Props {
    /** Why this entry cannot be changed here, shown on hover. */
    reason: string
  }
  const { reason }: Props = $props()
</script>

<span
  class="text-xs px-2 py-0.5 rounded border border-surface-300-700 opacity-80 whitespace-nowrap"
  title={reason}
>
  <i class="bi bi-lock"></i> read-only
</span>
