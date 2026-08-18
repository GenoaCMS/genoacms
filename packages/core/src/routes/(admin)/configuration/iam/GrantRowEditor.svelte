<script lang="ts">
  import { Tabs, SegmentedControl } from '@skeletonlabs/skeleton-svelte'
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
    {#each groups as group, index (index)}
      {#if group.label}
        <div class="text-xs font-medium opacity-70">{group.label}</div>
      {/if}
      <SegmentedControl
        value={group.options.some((o) => o.permission === row.permission) ? row.permission : null}
        onValueChange={(e) => { if (e.value) row.permission = e.value as typeof row.permission }}
      >
        <SegmentedControl.Control>
          <SegmentedControl.Indicator />
          {#each group.options as option (option.permission)}
            <SegmentedControl.Item value={option.permission}>
              <SegmentedControl.ItemText>{option.label}</SegmentedControl.ItemText>
              <SegmentedControl.ItemHiddenInput />
            </SegmentedControl.Item>
          {/each}
        </SegmentedControl.Control>
      </SegmentedControl>
    {/each}
  </div>

  {#if scoped}
    <label class="label">
      <span class="label-text">Applies to</span>
      <div class="input-group grid-cols-[auto_1fr]">
        <label class="ig-cell preset-tonal">
          <input type="checkbox" class="checkbox" bind:checked={row.anywhere} />
          <span class="ml-2">Any</span>
        </label>
        <input
          class="ig-input"
          bind:value={row.resourceId}
          placeholder="{scope} name"
          disabled={row.anywhere}
        />
      </div>
    </label>
  {/if}

  <div class="flex justify-end border-t border-surface-200-800 pt-2">
    <button
      type="button"
      class="flex items-center px-2"
      onclick={onremove}
      title="Remove grant"
      aria-label="Remove grant"
    >
      <i class="bi bi-trash text-xl text-error-500 hover:text-error-600 transition-all"></i>
    </button>
  </div>
</div>
