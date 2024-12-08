<script lang="ts">
    import { getContext } from 'svelte'
    import type { SelectionStoreT } from '$lib/script/storage/SelectionStore'

    type Props = {
      id: string | number
    }
    export const { id }: Props = $props()
    const selection: SelectionStoreT = getContext('selection')
    const canSelect = $derived($selection.canSelect)
    const isSelected = $derived($selection.isSelected(id))

    function select () {
      selection.select(id)
    }
</script>

<div class="w-auto h-auto relative z-[1]">
    <slot/>
    {#if canSelect || isSelected}
        <button on:click={select} class="absolute top-0 start-0 p-2">
            <i class="bi text-2xl transition-all" class:bi-square={!isSelected} class:bi-check-square={isSelected}/>
        </button>
    {/if}
</div>
