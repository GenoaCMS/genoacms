<script lang="ts">
  import type { SelectionStoreT } from '$lib/script/storage/SelectionStore'
  import { getContext } from 'svelte'

  const selection: SelectionStoreT = getContext('selection')
</script>

{#if selection.isSelecting && !$selection.isEmpty}
    <button role="button" onclick={selection.submit} class="h-full flex items-center px-3">
     <i class="bi bi-check-all text-2xl hover:text-warning transition-all"/>
    </button>
{/if}
