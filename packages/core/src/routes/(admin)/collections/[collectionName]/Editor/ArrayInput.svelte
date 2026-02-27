<script lang="ts" generics>
  import type { ArrayValue, InputValue } from './types'
  import type { JSONSchemaType } from 'ajv'
  import { Button } from 'flowbite-svelte'
  import Input from './Input.svelte'
  import { dragHandleZone } from 'svelte-dnd-action'
  import { flip } from 'svelte/animate'
  import { confirmationModal } from '$lib/script/alert'

  type wrappedT = { id: string; value: InputValue }
  interface Props {
    schema: JSONSchemaType<ArrayValue>;
    value?: ArrayValue;
    onvalue: (e: ArrayValue) => void;
  }
  const { schema, value, onvalue }: Props = $props()
  let items: Array<wrappedT> = $state(toWrappedValue(value || []))
  const flipDurationMs = 300

  function addItem () {
    items.push({ id: crypto.randomUUID(), value: undefined })
    updateValue()
  }
  async function deleteItem (index: number) {
    const confirmation = await confirmationModal(
      'Are you sure you want to delete this item?'
    )
    if (!confirmation.isConfirmed) return
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

<div
  use:dragHandleZone={{
    items,
    flipDurationMs,
    dropFromOthersDisabled: true,
    dropTargetStyle: { outline: '' },
  }}
  onconsider={handleDndConsider}
  onfinalize={handleDndFinalize}
>
  {#each items as item, index (item.id)}
    <div class="flex mt-1" animate:flip={{ duration: flipDurationMs }}>
      <div class="flex-grow">
        <Input
          schema={schema.items as JSONSchemaType<InputValue>}
          value={item.value}
          onvalue={(v) => updateItemValue(index, v)}
          ondelete={() => deleteItem(index)}
        />
      </div>
    </div>
  {/each}
</div>

<div class="w-full flex mt-3">
  <div class="mx-auto">
    <Button onclick={addItem} color="blue" class="flex min-w-[10rem]">
      <span class="me-auto"> Add item </span>
      <i class="bi bi-plus text-2xl"></i>
    </Button>
  </div>
</div>
