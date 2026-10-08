<script lang="ts" generics="T">
  import type { Snippet } from 'svelte'
  import { dragHandleZone } from 'svelte-dnd-action'

  interface Props {
    data: Array<T>,
    item: Snippet<[T]>,
    isId?: boolean,
    onorder: (d: Array<T>) => void
  }
  type SortableItem = { id: T | string, data: T }
  const flipDurationMs = 300
  const { data, item, isId, onorder }: Props = $props()
  let items: Array<SortableItem> = $state([])
  let isSorting = $state(false)

  function getItems (data: Array<T>): Array<SortableItem> {
    return data.map((item) => {
      return {
        id: isId ? item : crypto.randomUUID(),
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
  function extractData (items: Array<SortableItem>) {
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
