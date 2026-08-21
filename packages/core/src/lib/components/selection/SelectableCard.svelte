<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { NamedSelection, NamedEntry } from '$lib/script/selection/NamedSelection.svelte'
  import SelectionCheckbox from './SelectionCheckbox.svelte'

  /**
   * A catalogue card with a selection checkbox.
   *
   * The appearance comes from `SelectionCheckbox`, shared with the storage and collection browsers.
   * What this adds is the binding to a `NamedSelection` — the only thing specific to a list of
   * named entries.
   *
   * Children must be passed `noscale`: the wrapper scales the card and its checkbox together.
   */
  interface Props {
    selection: NamedSelection
    entry: NamedEntry
    children: Snippet
  }
  const { selection, entry, children }: Props = $props()
</script>

<SelectionCheckbox
  isSelected={selection.isSelected(entry.id)}
  onselect={() => selection.toggle(entry)}
  label="select-{entry.name}"
  scaleOnHover
>
  {@render children()}
</SelectionCheckbox>
