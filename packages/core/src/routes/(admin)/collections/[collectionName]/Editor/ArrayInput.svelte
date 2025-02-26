<script lang="ts" generics="">
  import type { ArrayValue, InputValue, Constraints, Errors } from './types'
  import type { JSONSchemaType } from 'ajv'
  import { Button } from 'flowbite-svelte'
  import Input from './Input.svelte'
  import { dndzone } from 'svelte-dnd-action'
  import { flip } from 'svelte/animate'

  type wrappedT = { id: string, value: InputValue }
  type Props = {
    schema: JSONSchemaType<InputValue>
    value?: ArrayValue,
    constraints: Constraints,
    errors: Errors,
    onvalue: (e: ArrayValue) => void
  }
  const { schema, value, constraints, errors, onvalue }: Props = $props()
  let items: Array<wrappedT> = $state(toWrappedValue(value || []))
  const flipDurationMs = 300

  function addItem () {
    items.push({ id: crypto.randomUUID(), value: undefined })
    updateValue()
  }
  function deleteItem (index: number) {
    items.splice(index, 1)
    updateValue()
  }
  function handleDndConsider (e: CustomEvent) {
    items = e.detail.items
  }
  function handleDndFinalize (e: CustomEvent) {
    items = e.detail.items
    updateValue()
  }
  function toWrappedValue (items: ArrayValue) {
    return items.map((item) => ({ id: crypto.randomUUID(), value: item }))
  }
  function toUnwrappedValue (items: Array<wrappedT>): ArrayValue {
    return items.map((item) => item.value)
  }
  function updateItemValue (index: number, value: InputValue) {
    items[index].value = value
    updateValue()
  }
  function updateValue () {
    onvalue(toUnwrappedValue(items))
  }
</script>

<div use:dndzone={{ items, flipDurationMs }} onconsider={handleDndConsider} onfinalize={handleDndFinalize}>
  {#each items as item, index (item.id)}
    <div class="flex mt-1" animate:flip={{ duration: flipDurationMs }}>
      <div class="flex-grow">
        <Input
          schema={schema.items}
          value={item.value}
          constraints={constraints?.[index]}
          errors={errors?.[index]}
          onvalue={(v) => updateItemValue(index, v)}/>
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
