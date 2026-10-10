<script lang="ts">
  import type { ArrayValue, InputValue } from '$lib/components/editors/types'
  import { asSchemaObject, type SchemaObject } from '$lib/script/schema'
  import Input from './Input.svelte'
  import ArrayItem from './ArrayItem.svelte'
  import { fieldKindOf } from './fieldKind'
  import { itemSummary, itemVariant } from './itemSummary'
  import { dragHandleZone } from 'svelte-dnd-action'
  import { flip } from 'svelte/animate'
  import { confirmationModal } from '$lib/script/alert.svelte'

  type wrappedT = { id: string; value: InputValue }
  interface Props {
    schema: SchemaObject,
    value?: ArrayValue
    onvalue: (e: ArrayValue) => void
  }
  const { schema, value, onvalue }: Props = $props()
  let items: Array<wrappedT> = $state(toWrappedValue(value || []))
  const flipDurationMs = 200

  const itemSchema = $derived(asSchemaObject(schema.items) ?? {})
  const isCollapsible = $derived(fieldKindOf(itemSchema) === 'object')
  const discriminator = $derived(itemSchema.discriminator?.propertyName ?? null)
  const isFull = $derived(schema.maxItems !== undefined && items.length >= schema.maxItems)

  function addItem () {
    items.push({ id: crypto.randomUUID(), value: undefined })
    updateValue()
  }
  async function deleteItem (index: number) {
    const confirmation = await confirmationModal(
      `Remove item #${index + 1}?`
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

<div class="flex flex-col gap-2">
  <div
    class="flex flex-col gap-2 empty:hidden"
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
      <div animate:flip={{ duration: flipDurationMs }}>
        <ArrayItem
          position={index + 1}
          summary={itemSummary(item.value, discriminator)}
          variant={itemVariant(item.value, discriminator)}
          {isCollapsible}
          onremove={() => deleteItem(index)}
        >
          <Input
            schema={itemSchema}
            value={item.value}
            onvalue={(v) => updateItemValue(index, v)}
          />
        </ArrayItem>
      </div>
    {/each}
  </div>

  {#if items.length === 0}
    <p class="text-sm text-surface-500">No items yet.</p>
  {/if}

  <button
    type="button"
    onclick={addItem}
    disabled={isFull}
    class="btn w-full border border-dashed border-surface-300-700 text-surface-700-300 hover:preset-tonal-primary hover:border-primary-500"
  >
    <i class="bi bi-plus-lg"></i>
    <span>Add item</span>
  </button>
</div>
