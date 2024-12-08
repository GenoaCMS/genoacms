<script lang="ts">
    import { page } from '$app/stores'
    import { getContext } from 'svelte'
    import type { SelectionStoreT } from '$lib/script/storage/SelectionStore'
    import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

    type Props = {
      name: string
    }
    export const { name }: Props = $props()
    const reference: ObjectReference = $derived({
      bucket: $page.params.bucketId,
      name
    })
    const selection: SelectionStoreT = getContext('selection')
    const canSelect = $derived($selection.canSelect)
    const isSelected = $derived($selection.isSelected(reference))

    function select () {
      selection.select(reference)
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
