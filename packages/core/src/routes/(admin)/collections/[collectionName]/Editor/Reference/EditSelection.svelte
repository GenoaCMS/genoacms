<script lang="ts">
  import { Button, } from '$lib/components/ui/index'

  type Props = {
    selectionId: string
    collectionId: string
    hideDeleteButton?: boolean,
    clear: () => void
  }
  const { selectionId, collectionId, hideDeleteButton = false, clear }: Props = $props()
  const selectHref = $derived(buildSelectURL(selectionId, collectionId))

  function buildSelectURL (selectionId: string, collectionId: string) {
    return `/collections/${collectionId}/?selectionId=${selectionId}`
  }
</script>

<div class="min-w-full w-full flex">
  <Button preset="outlined" href={selectHref} target="_blank"
    class="flex-grow flex items-center justify-center hover:text-warning transition-all shadow">
    <i class="bi bi-folder-symlink text-2xl"></i>
  </Button>
  {#if !hideDeleteButton}
    <Button preset="outlined" onclick={clear} class="hover:text-warning transition-all ms-2 shadow">
      <i class="bi bi-trash text-2xl"></i>
    </Button>
  {/if}
</div>
