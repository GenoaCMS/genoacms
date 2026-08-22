<script lang="ts">
    import type { Snippet } from 'svelte'
    import selection from '$lib/script/database/SelectionRune.svelte'
    import SelectionCheckbox from '$lib/components/selection/SelectionCheckbox.svelte'

    type Props = {
      id: string | number,
      children: Snippet
    }
    export const { id, children }: Props = $props()
    // Selectable on an ordinary visit as well as inside a picker, matching the storage browser: the
    // listing has a bulk deletion of its own, so a selection made here leads somewhere.
    //
    // Only the cap hides a checkbox, and only while a picker imposes one — outside a picker
    // `maxItems` is zero, which is no limit. A selected item keeps its checkbox regardless, or a
    // full selection could not be undone.
    const canSelect = $derived(selection.canSelectMore)
</script>

<!-- Inline, not overlaid: a document is a row whose first field starts at the left edge, so a box
     pinned over the corner would sit on top of the text. -->
<SelectionCheckbox
  isSelected={selection.isSelected(id)}
  onselect={() => selection.toggle(id)}
  label="Select {id}"
  layout="inline"
  {canSelect}
>
  {@render children?.()}
</SelectionCheckbox>
