<script lang="ts">
  /**
   * Whether this component has ever been published.
   *
   * The registrar is where a component is described, and a description nobody has released is not
   * yet something a page can be built on — which was previously invisible: a component looked
   * complete here whether or not anything had ever been published, and the difference only surfaced
   * as a page that rendered nothing.
   *
   * Shown for **both kinds**. A prebuilt component publishes a signed header and no executable, so
   * "published" means slightly different things for each; that it has been published at all means
   * exactly the same thing for both, which is what this says.
   *
   * **Two states, not three.** An "unpublished changes" state would be more useful and is
   * deliberately absent: answering it needs the header's canonical digest *and*, for a dynamic
   * component, the draft body compared against what was compiled — and a badge that checked only the
   * description would read "up to date" for a component whose code had moved on. Half an answer here
   * is worse than none, because the whole point of the badge is to be trusted at a glance.
   *
   * `unpublished` is the state worth noticing, so it is the one that carries a warning color. A
   * published component showing a neutral badge is the ordinary case and should not compete for
   * attention.
   */
  interface Props {
    /** When it was last published, or `undefined` if it never has been. */
    publishedAt?: number;
  }
  const { publishedAt }: Props = $props()

  const when = $derived(
    publishedAt === undefined ? '' : new Date(publishedAt).toLocaleString()
  )
</script>

{#if publishedAt === undefined}
  <span
    class="badge preset-tonal-warning"
    title="Nothing has been published yet, so no page can serve this component."
  >
    Unpublished
  </span>
{:else}
  <span class="badge preset-tonal" title="Last published {when}">
    Published
  </span>
{/if}
