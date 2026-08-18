<script lang="ts">
  import { Tabs, Combobox, Portal, useListCollection, type ComboboxRootProps } from '@skeletonlabs/skeleton-svelte'
  import { Input } from '$lib/components/ui/index'
  import { isResourceScoped, getPermissionScope } from '$lib/script/authorization/permissions'
  import { grantCategories, categoryOf, optionGroups } from './grantCategories'
  import type { GrantRow } from './grantRows'

  interface Props {
    row: GrantRow
    onremove: () => void
  }
  const { row = $bindable(), onremove }: Props = $props()

  // Opens on the category of whatever the row already holds, so editing an existing grant lands
  // where that grant lives rather than resetting to the first tab.
  let category = $state(categoryOf(row.permission))

  const groups = $derived(optionGroups(category))
  const scoped = $derived(row.permission !== '' && isResourceScoped(row.permission))
  const scope = $derived(scoped ? getPermissionScope(row.permission as never) : undefined)

  function chooseCategory (next: string | null): void {
    if (next === null) return
    category = next
    // The chosen permission belongs to the category that was left, so it no longer applies.
    row.permission = ''
    searchFilter = ''
  }

  interface ComboboxOption {
    label: string
    value: string
    group: string
  }

  const allItems = $derived(
    groups.flatMap((group) =>
      group.options.map((opt) => ({
        label: opt.label,
        value: opt.permission,
        group: group.label ?? 'Permissions'
      }))
    )
  )

  let searchFilter = $state('')

  const filteredItems = $derived(
    searchFilter.trim() === ''
      ? allItems
      : allItems.filter((item) =>
          item.label.toLowerCase().includes(searchFilter.toLowerCase()) ||
          item.value.toLowerCase().includes(searchFilter.toLowerCase())
        )
  )

  const hasMultipleGroups = $derived(groups.length > 1 && groups.some((g) => Boolean(g.label)))

  const collection = $derived(
    useListCollection({
      items: filteredItems,
      itemToString: (item: ComboboxOption) => item.label,
      itemToValue: (item: ComboboxOption) => item.value,
      groupBy: hasMultipleGroups ? (item: ComboboxOption) => item.group : undefined
    })
  )

  const onOpenChange = () => {
    searchFilter = ''
  }

  const onInputValueChange: ComboboxRootProps['onInputValueChange'] = (event) => {
    searchFilter = event.inputValue
  }

  const onValueChange: ComboboxRootProps['onValueChange'] = (event) => {
    if (event.value && event.value[0]) {
      row.permission = event.value[0] as typeof row.permission
    } else {
      row.permission = ''
    }
  }
</script>

<div class="card preset-filled-surface-50-950 border border-surface-200-800 space-y-3 p-3">
  <Tabs value={category} onValueChange={(e) => chooseCategory(e.value)}>
    <Tabs.List>
      {#each grantCategories as option (option.id)}
        <Tabs.Trigger value={option.id}>
          <i class="bi bi-{option.icon}"></i>
          <span class="ml-1 hidden sm:inline">{option.label}</span>
        </Tabs.Trigger>
      {/each}
      <Tabs.Indicator />
    </Tabs.List>
  </Tabs>

  <div class="space-y-2">
    <Combobox
      placeholder="Select permission..."
      {collection}
      {onOpenChange}
      {onInputValueChange}
      value={row.permission ? [row.permission] : []}
      {onValueChange}
      inputBehavior="autohighlight"
      openOnClick
      positioning={{ sameWidth: true, gutter: 4 }}
      class="w-full"
    >
      <Combobox.Control class="input-group grid-cols-[1fr_auto]">
        <Combobox.Input class="ig-input" placeholder="Select permission..." />
        <Combobox.Trigger class="ig-btn preset-tonal">
          <i class="bi bi-chevron-down"></i>
        </Combobox.Trigger>
      </Combobox.Control>
      <Portal>
        <Combobox.Positioner class="z-[150]">
          <Combobox.Content class="card bg-surface-50-950 border border-surface-200-800 p-1 shadow-xl max-h-60 overflow-y-auto z-[150]">
            {#if hasMultipleGroups}
              {#each collection.group() as [groupName, groupItems] (groupName)}
                <Combobox.ItemGroup>
                  <Combobox.ItemGroupLabel class="text-xs font-semibold text-surface-500 px-2 py-1">{groupName}</Combobox.ItemGroupLabel>
                  {#each groupItems as item (item.value)}
                    <Combobox.Item {item} class="px-2 py-1.5 rounded cursor-pointer hover:preset-tonal flex justify-between items-center text-sm">
                      <Combobox.ItemText>{item.label}</Combobox.ItemText>
                      <Combobox.ItemIndicator>
                        <i class="bi bi-check-lg"></i>
                      </Combobox.ItemIndicator>
                    </Combobox.Item>
                  {/each}
                </Combobox.ItemGroup>
              {/each}
            {:else}
              {#each filteredItems as item (item.value)}
                <Combobox.Item {item} class="px-2 py-1.5 rounded cursor-pointer hover:preset-tonal flex justify-between items-center text-sm">
                  <Combobox.ItemText>{item.label}</Combobox.ItemText>
                  <Combobox.ItemIndicator>
                    <i class="bi bi-check-lg"></i>
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              {/each}
            {/if}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox>
  </div>

  {#if scoped}
    <div class="space-y-2 pt-1">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold uppercase tracking-wider text-surface-500">Applies to</span>
        <label class="flex items-center space-x-2 text-xs font-medium cursor-pointer">
          <input type="checkbox" class="checkbox" bind:checked={row.anywhere} />
          <span>Any {scope}</span>
        </label>
      </div>

      <Input
        type="text"
        bind:value={row.resourceId}
        placeholder={row.anywhere ? `Applies to all ${scope}s` : `Specific ${scope} name`}
        disabled={row.anywhere}
        class="w-full {row.anywhere ? 'opacity-50' : ''}"
      />
    </div>
  {/if}

  <div class="flex justify-end border-t border-surface-200-800 pt-2">
    <button
      type="button"
      class="flex items-center px-2 cursor-pointer"
      onclick={onremove}
      title="Remove grant"
      aria-label="Remove grant"
    >
      <i class="bi bi-trash text-xl text-error-500 hover:text-error-600 transition-all"></i>
    </button>
  </div>
</div>
