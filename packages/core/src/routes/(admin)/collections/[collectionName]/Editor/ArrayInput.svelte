<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Button } from 'flowbite-svelte'
  import Input from './Input.svelte'

  type T = undefined | string | number | boolean | object
  export let name: string
  export let schema: JSONSchemaType<T>
  export let value: Array<T> = []

  function addItem () {
    value = [...value, undefined]
  }
  function deleteItem (index: number) {
    value.splice(index, 1)
    value = [...value]
  }
</script>

{#each value as item, index}
  <div class="flex mt-1">
    <div class="flex-grow">
      <Input {name} schema={schema.items} bind:value={item}/>
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
