<script lang="ts">
  /**
   * Shown when the stored document could not be used.
   *
   * The instance is running on the defaults from `genoa.config`, which is a different situation from
   * being configured — and saving from here replaces the unreadable document rather than editing it.
   */
  interface Props {
    reason: string
  }
  const { reason }: Props = $props()
</script>

<aside class="rounded border border-red-400 bg-red-50 dark:bg-red-950 p-4 text-sm space-y-2">
  <p class="font-semibold">The stored policy could not be read: {reason}</p>
  <p>
    These are the defaults from <code>genoa.config</code>, which the instance is running on. The
    document is left in place for inspection. Saving here replaces it.
  </p>
</aside>
