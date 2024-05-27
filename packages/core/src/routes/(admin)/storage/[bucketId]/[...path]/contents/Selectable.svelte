<script lang="ts">
    import { page } from '$app/stores'
    import { getContext } from 'svelte'
    import type { SelectionStoreT } from '$lib/script/storage/SelectionStore'
    import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

    export let name
    let reference: ObjectReference
    const selection: SelectionStoreT = getContext('selection')
    const select = () => {
      selection.select(reference)
    }

    $: reference = {
      bucket: $page.params.bucketId,
      name
    }
    $: canSelect = $selection.canSelect
    $: isSelected = $selection.isSelected(reference)
</script>

<div class="w-auto h-auto relative">
    <slot/>
    {#if canSelect || isSelected}
        <button on:click={select} class="absolute top-0 start-0 p-2">
            <i class="bi text-2xl transition-all" class:bi-square={!isSelected} class:bi-check-square={isSelected}/>
        </button>
    {/if}
</div>
