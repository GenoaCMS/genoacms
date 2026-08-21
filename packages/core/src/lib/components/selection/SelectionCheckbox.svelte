<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * Children with a selection checkbox in the corner.
   *
   * The markup three surfaces had each written out: a relatively positioned wrapper, the thing being
   * selected, and a box pinned to its top-left. Nothing here knows *what* is selected — the caller
   * passes the state and the handler — so the storage browser, the collection list and the catalogue
   * lists share the appearance without sharing their reference types.
   *
   * **The hover scale is optional and belongs to the wrapper.** The checkbox is a sibling of the
   * content rather than a child, so content that scaled itself would grow out from under its own
   * checkbox. Callers that want the effect ask for it here and pass `noscale` to the card inside.
   */
  interface Props {
    isSelected: boolean
    onselect: () => void
    /** The accessible name of the checkbox, which is how tests and screen readers address it. */
    label: string
    /** Hidden entirely when false — a directory in a picker that only accepts files. */
    canSelect?: boolean
    /** Grows the content and the checkbox together on hover. */
    scaleOnHover?: boolean
    children: Snippet
  }
  const {
    isSelected,
    onselect,
    label,
    canSelect = true,
    scaleOnHover = false,
    children
  }: Props = $props()
</script>

<div class={scaleOnHover ? 'transition-all hover:scale-105' : ''}>
  <div class="w-auto h-auto relative z-[1]">
    {@render children()}
    {#if canSelect || isSelected}
      <button
        type="button"
        onclick={onselect}
        aria-label={label}
        aria-pressed={isSelected}
        class="absolute top-0 start-0 p-2"
      >
        <i
          class="bi text-2xl transition-all"
          class:bi-square={!isSelected}
          class:bi-check-square={isSelected}
        ></i>
      </button>
    {/if}
  </div>
</div>
