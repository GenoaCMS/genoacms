<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Button } from 'flowbite-svelte'
  import Input from './Input.svelte'

  type T = undefined | string | number | boolean | object
  type Props = {
    name: string
    schema: JSONSchemaType<T>
    value?: Array<T>
  }
  let { name, schema, value = $bindable() }: Props = $props()
  const items: Array<T> = $state(value || [])

  function addItem () {
    items.push(undefined)
  }
  function deleteItem (index: number) {
    items.splice(index, 1)
  }
  $effect(() => value = items)
</script>

{#each items as item, index (item, crypto.randomUUID())}
  <div class="flex mt-1">
    <div class="flex-grow">
      <Input {name} schema={schema.items} bind:value={items[index]}/>
    </div>
    <div class="w-auto">
      <Button on:click={() => deleteItem(index)} color="red">
        <i class="bi bi-trash text-lg"></i>
      </Button>
    </div>
  </div>
{/each}

<div class="w-full flex mt-3">
  <div class="ms-auto">
    <Button on:click={addItem} color="blue">
      <i class="bi bi-plus text-lg"></i>
    </Button>
  </div>
</div>
