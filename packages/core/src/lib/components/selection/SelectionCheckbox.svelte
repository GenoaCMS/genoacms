<script lang="ts">
  import type { Snippet } from 'svelte'
  import { SELECTION_GUTTER } from '$lib/script/selection/gutter'
  import SelectionBox from './SelectionBox.svelte'

  /**
   * Children with a selection checkbox.
   *
   * The markup several surfaces had each written out. Nothing here knows *what* is selected — the
   * caller passes the state and the handler — so the storage browser, the collection listing and the
   * catalog lists share the appearance without sharing their reference types.
   *
   * ## Where the box goes depends on what it selects
   *
   * A **card** in a grid has empty corners, so the box is pinned over its top-left and costs no
   * layout. A **row** in a list does not: its first field starts at the left edge, and an overlaid
   * box lands on top of the text. Rows therefore get a column of their own, and that column is kept
   * even when the box is hidden — otherwise a row without a checkbox would sit shifted against its
   * neighbors.
   *
   * **The hover scale belongs to the wrapper.** The checkbox is a sibling of the content rather than
   * a child, so content that scaled itself would grow out from under its own checkbox. Callers that
   * want the effect ask for it here and pass `noscale` to the card inside.
   */
  interface Props {
    isSelected: boolean
    onselect: () => void
    /** The accessible name of the checkbox, which is how tests and screen readers address it. */
    label: string
    /** Hidden entirely when false — a directory in a picker that only accepts files. */
    canSelect?: boolean
    /** `overlay` for cards in a grid, `inline` for rows in a list. */
    layout?: 'overlay' | 'inline'
    /** Grows the content and the checkbox together on hover. Overlay layout only. */
    scaleOnHover?: boolean
    children: Snippet
  }
  const {
    isSelected,
    onselect,
    label,
    canSelect = true,
    layout = 'overlay',
    scaleOnHover = false,
    children
  }: Props = $props()

  /** A selected item keeps its box regardless, or a full selection could not be undone. */
  const isShown = $derived(canSelect || isSelected)
</script>

{#if layout === 'inline'}
  <div class="flex items-center">
    <div class="{SELECTION_GUTTER} shrink-0 flex items-center justify-center">
      {#if isShown}
        <SelectionBox {isSelected} {onselect} {label} />
      {/if}
    </div>
    <div class="grow min-w-0">
      {@render children()}
    </div>
  </div>
{:else}
  <div class={scaleOnHover ? 'transition-all hover:scale-105' : ''}>
    <div class="w-auto h-auto relative z-[1]">
      {@render children()}
      {#if isShown}
        <div class="absolute top-0 start-0">
          <SelectionBox {isSelected} {onselect} {label} />
        </div>
      {/if}
    </div>
  </div>
{/if}
