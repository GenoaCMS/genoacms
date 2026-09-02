<script lang="ts">
  import type { NamedSelection, NamedEntry } from '$lib/script/selection/NamedSelection.svelte'

  /**
   * Select-all, which becomes clear-all once anything is selected.
   *
   * One control rather than two, as in the storage browser: the useful action is always the opposite
   * of the current state, so a second button would spend space on the one nobody wants.
   */
  interface Props {
    selection: NamedSelection
    /** Everything on screen, in the order it is shown. */
    entries: NamedEntry[]
  }
  const { selection, entries }: Props = $props()
</script>

{#if selection.isEmpty}
  <button
    type="button"
    aria-label="Select all"
    onclick={() => selection.selectAll(entries)}
    class="h-full flex items-center px-3"
  >
    <i class="bi bi-square text-2xl hover:text-warning transition-all"></i>
  </button>
{:else}
  <button
    type="button"
    aria-label="Unselect all"
    onclick={() => selection.clear()}
    class="h-full flex items-center px-3"
  >
    <i class="bi bi-slash-square text-2xl hover:text-warning transition-all"></i>
  </button>
{/if}
