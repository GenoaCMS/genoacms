<script lang="ts">
  import { Card } from 'flowbite-svelte'
  export let selectionId

  function buildSelectURL (selectionId: string) {
    return `/storage?selectionId=${selectionId}`
  }

  $: selectHref = buildSelectURL(selectionId)
</script>

<Card href={selectHref} target="_blank" padding="sm" class="h-auto w-full flex items-center justify-center hover:text-warning transition-all">
  <i class="bi bi-folder-symlink text-2xl"></i>
</Card>
