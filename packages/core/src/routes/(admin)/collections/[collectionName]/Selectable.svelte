<script lang="ts">
    import type { SelectActionRune } from '$lib/script/storage/SelectActionRune.svelte'
    import selection from '$lib/script/storage/SelectionRune.svelte'
    import { getContext, type Snippet } from 'svelte'

    type Props = {
      id: string | number,
      children: Snippet
    }
    export const { id, children }: Props = $props()
    const selectAction: SelectActionRune = getContext('select')
    const canSelect = $derived(selectAction.isActive && selection.canSelect)
    const isSelected = $derived(selection.isSelected(id))

    function select () {
      selection.select(id)
    }
</script>

<div class="w-auto h-auto relative z-[1]">
  {@render children?.()}
  {#if canSelect || isSelected}
    <button onclick={select} aria-label="Select {id}" class="absolute top-0 start-0 p-2">
      <i
        class="bi text-2xl transition-all"
        class:bi-square={!isSelected}
        class:bi-check-square={isSelected}></i>
    </button>
  {/if}
</div>
