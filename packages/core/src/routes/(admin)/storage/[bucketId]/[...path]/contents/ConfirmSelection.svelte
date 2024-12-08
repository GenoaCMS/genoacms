<script lang="ts">
  import type { SelectionStoreT } from '$lib/script/storage/SelectionStore'

  type Props = {
    selection: SelectionStoreT
  }
  const { selection }: Props = $props()
</script>

{#if selection.isSelecting && !$selection.isEmpty}
    <button role="button" onclick={selection.submit} class="h-full flex items-center px-3">
     <i class="bi bi-check-all text-2xl hover:text-warning transition-all"/>
    </button>
{/if}
