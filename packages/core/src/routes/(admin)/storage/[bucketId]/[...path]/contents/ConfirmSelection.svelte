<script lang="ts">
  import type { SelectionStoreT } from '$lib/script/storage/SelectionStore'
  import type { SelectionType } from '$lib/script/storage/types'
  import { page } from '$app/stores'
  import { enhance } from '$app/forms'

  export let selection: SelectionStoreT

  $: isSelectionEmpty = $selection.values.length === 0
</script>

{#if selection.isSelecting && !isSelectionEmpty}
    <button role="button" on:click={selection.submit} class="h-full flex items-center px-3">
     <i class="bi bi-check-all text-2xl hover:text-warning transition-all"/>
    </button>
{/if}
