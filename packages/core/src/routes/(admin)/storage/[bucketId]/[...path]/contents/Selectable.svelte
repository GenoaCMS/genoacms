<script lang="ts">
    import { page } from '$app/stores'
    import { getContext } from 'svelte'
    import type { SelectionStoreT } from '../../../SelectionStore'

    export let name
    const reference = {
      bucket: $page.params.bucketId,
      name
    }
    const selection: SelectionStoreT = getContext('selection')
    const select = () => {
      $selection.select(reference)
    }

    $: canBeSelected = $selection.canBeSelected()
    $: isSelected = $selection.isSelected(reference)
</script>

<div class="w-auto h-auto relative">
    <slot/>
    {#if canBeSelected || isSelected}
        <button on:click={select} class="absolute top-0 start-0 p-2">
            <i class="bi text-2xl transition-all" class:bi-square={!isSelected} class:bi-check-square={isSelected}/>
        </button>
    {/if}
</div>
