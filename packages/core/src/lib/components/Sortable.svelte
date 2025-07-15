<script lang="ts">
  import type { Snippet } from 'svelte'
  import { dragHandleZone } from 'svelte-dnd-action'

  interface Props {
    data: Array<unknown>,
    item: Snippet<unknown>,
    isId?: boolean,
    idField?: string,
    onorder: (d: Array<unknown>) => void
  }
  const flipDurationMs = 300
  const { data, item, isId, idField, onorder }: Props = $props()
  let items = $state([])
  let isSorting = $state(false)

  function getItems (data) {
    return data.map((item) => {
      return {
        id: isId ? item : idField ? data[idField] : crypto.randomUUID(),
        data: item
      }
    })
  }
  function handleDndConsider (e: CustomEvent) {
    isSorting = true
    items = e.detail.items
  }
  function handleDndFinalize (e: CustomEvent) {
    isSorting = false
    items = e.detail.items
    onorder(extractData(items))
  }
  function extractData (items: Array<{ id: string, data: unknown }>) {
    return items.map(i => i.data)
  }
  $effect(() => {
    if (!isSorting) items = getItems(data)
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
