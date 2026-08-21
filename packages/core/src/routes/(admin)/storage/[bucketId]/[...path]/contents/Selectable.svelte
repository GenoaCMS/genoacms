<script lang="ts">
    import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
    import type { Snippet } from 'svelte'
    import { page } from '$app/state'
    import selection from '$lib/script/storage/SelectionRune.svelte'
    import SelectionCheckbox from '$lib/components/selection/SelectionCheckbox.svelte'

    type Props = {
      name: string,
      children: Snippet,
      isDirectory?: boolean
    }
    export const { name, children, isDirectory = false }: Props = $props()
    const reference: ObjectReference = $derived({
      bucket: page.params.bucketId,
      name
    })
</script>

<SelectionCheckbox
  isSelected={selection.isSelected(reference)}
  onselect={() => selection.toggle(reference)}
  label="select-{name}"
  canSelect={!isDirectory || selection.allowDirectories}
>
  {@render children()}
</SelectionCheckbox>
