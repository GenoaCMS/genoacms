<script lang="ts">
  import { Combobox as SkeletonCombobox, Portal, useListCollection, type ComboboxRootProps } from '@skeletonlabs/skeleton-svelte'

  /**
   * A searchable single-select.
   *
   * The presentation layer only: it knows how to filter, group and render a list of labeled
   * values, and nothing about what the values mean. Both grant editors — choosing a permission and
   * choosing the bucket or collection it applies to — are the same control over different lists, so
   * the list is a prop rather than two near-identical components.
   *
   * Grouping is inferred from the items: a list whose entries carry a `group` renders sub-headings,
   * one that does not renders a flat list. Callers therefore express grouping by how they build the
   * list rather than by setting a second flag that could contradict it.
   */
  interface ComboboxItem {
    label: string
    value: string
    /** Sub-heading this item belongs under. A list mixing set and unset groups is not supported. */
    group?: string
  }

  interface Props {
    items: ComboboxItem[]
    /** The selected value, or `''` when nothing is chosen. */
    value: string
    onselect: (value: string) => void
    placeholder?: string
    disabled?: boolean
    /** Shown in place of the list when there is nothing to choose from. */
    emptyMessage?: string
  }

  const {
    items,
    value,
    onselect,
    placeholder = 'Select...',
    disabled = false,
    emptyMessage = 'Nothing to choose from'
  }: Props = $props()

  let searchFilter = $state('')

  const matches = (item: ComboboxItem, term: string): boolean =>
    item.label.toLowerCase().includes(term) || item.value.toLowerCase().includes(term)

  const filteredItems = $derived.by(() => {
    const term = searchFilter.trim().toLowerCase()
    return term === '' ? items : items.filter(item => matches(item, term))
  })

  const grouped = $derived(items.some(item => item.group !== undefined))

  const collection = $derived(
    useListCollection({
      items: filteredItems,
      itemToString: (item: ComboboxItem) => item.label,
      itemToValue: (item: ComboboxItem) => item.value,
      groupBy: grouped ? (item: ComboboxItem) => item.group ?? '' : undefined
    })
  )

  const onOpenChange = () => {
    searchFilter = ''
  }

  const onInputValueChange: ComboboxRootProps['onInputValueChange'] = (event) => {
    searchFilter = event.inputValue
  }

  const onValueChange: ComboboxRootProps['onValueChange'] = (event) => {
    onselect(event.value?.[0] ?? '')
  }
</script>

{#snippet option (item: ComboboxItem)}
  <SkeletonCombobox.Item {item} class="px-2 py-1.5 rounded cursor-pointer hover:preset-tonal flex justify-between items-center text-sm">
    <SkeletonCombobox.ItemText>{item.label}</SkeletonCombobox.ItemText>
    <SkeletonCombobox.ItemIndicator>
      <i class="bi bi-check-lg"></i>
    </SkeletonCombobox.ItemIndicator>
  </SkeletonCombobox.Item>
{/snippet}

<SkeletonCombobox
  {collection}
  {onOpenChange}
  {onInputValueChange}
  {onValueChange}
  {disabled}
  value={value === '' ? [] : [value]}
  inputBehavior="autohighlight"
  openOnClick
  positioning={{ sameWidth: true, gutter: 4 }}
  class="w-full"
>
  <SkeletonCombobox.Control class="input-group grid-cols-[1fr_auto]">
    <SkeletonCombobox.Input class="ig-input" {placeholder} />
    <SkeletonCombobox.Trigger class="ig-btn preset-tonal">
      <i class="bi bi-chevron-down"></i>
    </SkeletonCombobox.Trigger>
  </SkeletonCombobox.Control>
  <Portal>
    <SkeletonCombobox.Positioner class="z-[150]">
      <SkeletonCombobox.Content class="card bg-surface-50-950 border border-surface-200-800 p-1 shadow-xl max-h-60 overflow-y-auto z-[150]">
        {#if items.length === 0}
          <p class="px-2 py-1.5 text-sm opacity-60">{emptyMessage}</p>
        {:else if grouped}
          {#each collection.group() as [groupName, groupItems] (groupName)}
            <SkeletonCombobox.ItemGroup>
              <SkeletonCombobox.ItemGroupLabel class="text-xs font-semibold text-surface-500 px-2 py-1">
                {groupName}
              </SkeletonCombobox.ItemGroupLabel>
              {#each groupItems as item (item.value)}
                {@render option(item)}
              {/each}
            </SkeletonCombobox.ItemGroup>
          {/each}
        {:else}
          {#each filteredItems as item (item.value)}
            {@render option(item)}
          {/each}
        {/if}
      </SkeletonCombobox.Content>
    </SkeletonCombobox.Positioner>
  </Portal>
</SkeletonCombobox>
