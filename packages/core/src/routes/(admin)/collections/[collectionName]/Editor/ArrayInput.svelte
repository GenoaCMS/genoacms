<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Button } from 'flowbite-svelte'
  import Input from './Input.svelte'
  import { dndzone } from 'svelte-dnd-action'
  import { flip } from 'svelte/animate'

  type T = undefined | string | number | boolean | object
  type wrappedT = { id: string, value: T }
  type Props = {
    name: string
    schema: JSONSchemaType<T>
    value?: Array<T>
  }
  let { name, schema, value = $bindable() }: Props = $props()
  let items: Array<wrappedT> = $state(toWrappedValue(value || []))
  const flipDurationMs = 300

  function addItem () {
    items.push({ id: crypto.randomUUID(), value: undefined })
  }
  function deleteItem (index: number) {
    items.splice(index, 1)
  }
  function handleDndConsider (e) {
    items = e.detail.items
  }
  function handleDndFinalize (e) {
    items = e.detail.items
  }
  function toWrappedValue (items: Array<T>) {
    return items.map((item) => ({ id: crypto.randomUUID(), value: item }))
  }
  function toUnwrappedValue (items: Array<wrappedT>): Array<T> {
    return items.map((item) => item.value)
  }
  $effect(() => value = toUnwrappedValue(items))
</script>

<div use:dndzone={{ items, flipDurationMs }} onconsider={handleDndConsider} onfinalize={handleDndFinalize}>
  {#each items as item, index (item.id)}
    <div class="flex mt-1" animate:flip={{ duration: flipDurationMs }}>
      <div class="flex-grow">
        <Input {name} schema={schema.items} bind:value={item.value}/>
      </div>
      <div class="w-auto">
        <Button on:click={() => deleteItem(index)} color="red">
          <i class="bi bi-trash text-lg"></i>
        </Button>
      </div>
    </div>
  {/each}
</div>

<div class="w-full flex mt-3">
  <div class="ms-auto">
    <Button on:click={addItem} color="blue">
      <i class="bi bi-plus text-lg"></i>
    </Button>
  </div>
</div>
