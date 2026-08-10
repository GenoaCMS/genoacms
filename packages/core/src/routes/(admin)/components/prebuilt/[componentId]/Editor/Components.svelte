<script lang="ts">
  import type { ComponentsAttributeMetaSchema } from '$lib/script/components/componentEntry/component/types'
  import ParalelInputs from '$lib/components/editors/ParalelInputs.svelte'
  import { Input, Label } from '$lib/components/ui/index'

  interface Props {
    default: ComponentsAttributeMetaSchema['default'],
    maxItems: ComponentsAttributeMetaSchema['maxItems'],
    minItems: ComponentsAttributeMetaSchema['minItems']
  }

  let {
    default: d = $bindable(), // TODO: default value selector, !except recursion
    maxItems = $bindable(),
    minItems = $bindable()
  }: Props = $props()
</script>

<ParalelInputs>
  <Label>
    Minimum instances:
    <Input type="number" bind:value={minItems} />
  </Label>
  <Label>
    Maximum instances:
    <Input type="number" bind:value={maxItems} />
  </Label>
</ParalelInputs>
