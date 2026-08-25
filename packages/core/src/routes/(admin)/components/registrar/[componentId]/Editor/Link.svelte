<script lang="ts">
  import type { LinksMetaSchema } from '$lib/script/components/componentHeader/component/types'
  import ParalelInputs from '$lib/components/editors/ParalelInputs.svelte'
  import ConstraintInput from '$lib/components/editors/ConstraintInput.svelte'
  import { Label } from '$lib/components/ui/index'

  // TODO: default value selector, !except recursion
  interface Props {
    schema: LinksMetaSchema
  }
  const { schema }: Props = $props()
</script>

<ParalelInputs>
  <Label>
    Minimum links:
    <ConstraintInput {schema} constraint="minItems" />
  </Label>
  <Label>
    Maximum links
    <ConstraintInput {schema} constraint="maxItems" />
  </Label>
</ParalelInputs>
