<script lang="ts">
  import type { StorageResourcesMetaSchema } from '$lib/script/components/componentHeader/component/types'
  import ParalelInputs from '$lib/components/editors/ParalelInputs.svelte'
  import ConstraintInput from '$lib/components/editors/ConstraintInput.svelte'
  import { Label } from '$lib/components/ui/index'

  // TODO: default value selector, !except recursion
  interface Props {
    schema: StorageResourcesMetaSchema
  }
  const { schema }: Props = $props()
</script>

<ParalelInputs>
  <Label>
    Minimum resources:
    <ConstraintInput {schema} constraint="minItems" />
  </Label>
  <Label>
    Maximum resources
    <ConstraintInput {schema} constraint="maxItems" />
  </Label>
</ParalelInputs>
