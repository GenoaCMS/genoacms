<script lang="ts">
  import type { Snippet } from 'svelte'
  import { dragHandleZone } from 'svelte-dnd-action'

  interface Props {
    data: Array<unknown>,
    item: Snippet<unknown>,
    onorder: (d: Array<unknown>) => void
  }
  const flipDurationMs = 300
  const { data, item, onorder }: Props = $props()

  function getItems (data) {
    return data.map((item) => {
      return {
        id: crypto.randomUUID(),
        data: item
      }
    })
  }
  let items = $state(getItems(data))
  function handleDndConsider (e: CustomEvent) {
    items = e.detail.items
  }
  function handleDndFinalize (e: CustomEvent) {
    items = e.detail.items
    onorder(extractData(items))
  }
  function extractData (items: Array<{ id: string, data: unknown }>) {
    return items.map(i => i.data)
  }
  $effect(() => {
    items = getItems(data)
  })
</script>

<div
  use:dragHandleZone={{ items, flipDurationMs }}
  onconsider={handleDndConsider}
  onfinalize={handleDndFinalize}>
  {#each items as { id, data } (id)}
    {@render item(data)}
  {/each}
</div>
