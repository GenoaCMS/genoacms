<script lang="ts">
  import { untrack } from 'svelte'
  import { Tabs } from '@skeletonlabs/skeleton-svelte'
  import { Combobox } from '$lib/components/ui/index'
  import { grantCategories, categoryOf, optionGroups } from './grantCategories'
  import type { Permission } from '$lib/script/authorization/permissions'

  /**
   * Choosing *which* permission a grant carries: the category tabs and the permission list.
   *
   * Split from the row editor so the row is a composition of the two decisions a grant records —
   * which permission, and over what — rather than one component holding both controls and the
   * state each needs.
   */
  interface Props {
    permission: Permission | ''
    onselect: (permission: Permission | '') => void
  }
  const { permission, onselect }: Props = $props()

  // Opens on the category of whatever the row already holds, so editing an existing grant lands
  // where that grant lives rather than resetting to the first tab. Read untracked because that is
  // the whole intent: which tab is open afterwards is the administrator's choice, not a function of
  // the permission, and re-deriving it would drag them back on every change.
  let category = $state(untrack(() => categoryOf(permission)))

  /**
   * The permission list for the open category, flattened for the combobox.
   *
   * A group label is attached only when the category actually has sub-headings, so a single-group
   * category renders as a flat list rather than under one redundant heading.
   */
  const items = $derived(
    optionGroups(category).flatMap(group =>
      group.options.map(option => ({
        label: option.label,
        value: option.permission,
        group: group.label
      }))
    )
  )

  function chooseCategory (next: string | null): void {
    if (next === null) return
    category = next
    // The chosen permission belongs to the category that was left, so it no longer applies.
    onselect('')
  }
</script>

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

<Combobox
  {items}
  value={permission}
  onselect={(value) => onselect(value as Permission | '')}
  placeholder="Select permission..."
/>
