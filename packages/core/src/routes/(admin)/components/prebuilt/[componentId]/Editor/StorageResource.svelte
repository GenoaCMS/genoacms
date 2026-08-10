<script lang="ts">
  import type { StorageResourcesMetaSchema } from '$lib/script/components/componentEntry/component/types'
  import ParalelInputs from '$lib/components/editors/ParalelInputs.svelte'
  import { Input, Label } from '$lib/components/ui/index'

  interface Props {
    default: StorageResourcesMetaSchema['default'],
    maxItems: StorageResourcesMetaSchema['maxItems'],
    minItems: StorageResourcesMetaSchema['minItems']
  }

  let {
    default: d = $bindable(), // TODO: default value selector, !except recursion
    maxItems = $bindable(),
    minItems = $bindable()
  }: Props = $props()
</script>

<ParalelInputs>
  <Label>
    Minimum resources:
    <Input type="number" bind:value={minItems} />
  </Label>
  <Label>
    Maximum resources
    <Input type="number" bind:value={maxItems} />
  </Label>
</ParalelInputs>
