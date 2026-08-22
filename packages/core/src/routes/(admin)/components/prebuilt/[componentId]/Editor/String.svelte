<script lang="ts">
  import type { StringMetaSchema } from '$lib/script/components/componentEntry/component/types'
  import { Label } from '$lib/components/ui/index'
  import ParalelInputs from '$lib/components/editors/ParalelInputs.svelte'
  import ConstraintInput from '$lib/components/editors/ConstraintInput.svelte'

  interface Props {
    schema: StringMetaSchema
  }
  const { schema }: Props = $props()
</script>

<Label>
  Default:
  <ConstraintInput {schema} constraint="default" kind="text" />
</Label>
<ParalelInputs>
  <Label>
    Minimum length:
    <ConstraintInput {schema} constraint="minLength" />
  </Label>
  <Label>
    Maximum length:
    <ConstraintInput {schema} constraint="maxLength" />
  </Label>
  <Label>
    Regex pattern:
    <ConstraintInput {schema} constraint="pattern" kind="text" />
  </Label>
  <Label>
    Format:
    <ConstraintInput {schema} constraint="format" kind="text" />
  </Label>
</ParalelInputs>
