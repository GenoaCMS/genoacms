<script lang="ts">
    import type { SelectActionRune } from '$lib/script/database/SelectActionRune.svelte'
    import type { Snippet } from 'svelte'
    import { getContext } from 'svelte'
    import selection from '$lib/script/database/SelectionRune.svelte'
    import SelectionCheckbox from '$lib/components/selection/SelectionCheckbox.svelte'

    type Props = {
      id: string | number,
      children: Snippet
    }
    export const { id, children }: Props = $props()
    const selectAction: SelectActionRune = getContext('select')
    // Documents are only selectable while a picker is open: there is no bulk action on the list
    // itself, so a checkbox outside that flow would select towards nothing.
    const canSelect = $derived(selectAction.isActive && selection.canSelectMore)
</script>

<SelectionCheckbox
  isSelected={selection.isSelected(id)}
  onselect={() => selection.toggle(id)}
  label="Select {id}"
  {canSelect}
>
  {@render children?.()}
</SelectionCheckbox>
