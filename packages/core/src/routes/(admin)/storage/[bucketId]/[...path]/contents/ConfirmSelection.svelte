<script lang="ts">
  import type { SelectionStoreT } from '$lib/script/storage/SelectionStore'

  export let selection: SelectionStoreT
</script>

{#if selection.isSelecting && !$selection.isEmpty}
    <button role="button" on:click={selection.submit} class="h-full flex items-center px-3">
     <i class="bi bi-check-all text-2xl hover:text-warning transition-all"/>
    </button>
{/if}
