<script lang="ts">
  import { Button } from 'flowbite-svelte'

  type Props = {
    selectionId: string
    hideDeleteButton?: boolean,
    clear: () => void
  }
  const { selectionId, hideDeleteButton = false, clear }: Props = $props()
  const selectHref = $derived(buildSelectURL(selectionId))

  function buildSelectURL (selectionId: string) {
    return `/storage?selectionId=${selectionId}`
  }
</script>

<div class="min-w-full w-full flex">
  <Button href={selectHref} target="_blank" outline
    class="flex-grow flex items-center justify-center hover:text-warning transition-all shadow">
    <i class="bi bi-folder-symlink text-2xl"></i>
  </Button>
  {#if !hideDeleteButton}
    <Button onclick={clear} color="red" outline class="hover:text-warning transition-all ms-2 shadow">
      <i class="bi bi-trash text-2xl"></i>
    </Button>
  {/if}
</div>
