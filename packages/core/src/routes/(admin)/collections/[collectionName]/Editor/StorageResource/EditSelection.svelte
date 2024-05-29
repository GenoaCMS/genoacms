<script lang="ts">
  import { Button } from 'flowbite-svelte'
  import { createEventDispatcher } from 'svelte'

  export let selectionId
  const dispatch = createEventDispatcher()

  function buildSelectURL (selectionId: string) {
    return `/storage?selectionId=${selectionId}`
  }
  function clear () {
    dispatch('clear')
  }

  $: selectHref = buildSelectURL(selectionId)
</script>

<div class="min-w-full w-full flex">
  <Button href={selectHref} target="_blank" outline
    class="flex-grow flex items-center justify-center hover:text-warning transition-all shadow">
    <i class="bi bi-folder-symlink text-2xl"></i>
  </Button>
  <Button on:click={clear} color="light" outline class="hover:text-warning transition-all ms-2 shadow">
    <i class="bi bi-trash text-2xl"></i>
  </Button>
</div>
