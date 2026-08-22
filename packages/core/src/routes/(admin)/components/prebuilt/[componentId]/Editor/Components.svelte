<script lang="ts">
  import type { ComponentsAttributeMetaSchema } from '$lib/script/components/componentEntry/component/types'
  import ParalelInputs from '$lib/components/editors/ParalelInputs.svelte'
  import ConstraintInput from '$lib/components/editors/ConstraintInput.svelte'
  import { Label } from '$lib/components/ui/index'

  // TODO: default value selector, !except recursion
  interface Props {
    schema: ComponentsAttributeMetaSchema
  }
  const { schema }: Props = $props()
</script>

<ParalelInputs>
  <Label>
    Minimum instances:
    <ConstraintInput {schema} constraint="minItems" />
  </Label>
  <Label>
    Maximum instances:
    <ConstraintInput {schema} constraint="maxItems" />
  </Label>
</ParalelInputs>
