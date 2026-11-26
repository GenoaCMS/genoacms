<script lang="ts">
  /** POL-3 */
  interface Props {
    reason: string
  }
  const { reason }: Props = $props()
</script>

<aside class="rounded border border-red-400 bg-red-50 dark:bg-red-950 p-4 text-sm space-y-2">
  <p class="font-semibold">The stored policy could not be read: {reason}</p>
  <p>
    Until it is rewritten, sign-in runs on the strictest token lifetimes and nothing can be published.
    The values below are the defaults from <code>genoa.config</code>. Saving here replaces the stored
    document.
  </p>
</aside>
