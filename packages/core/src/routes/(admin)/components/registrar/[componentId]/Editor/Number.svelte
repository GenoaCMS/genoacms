<script lang="ts">
  import type { NumberMetaSchema } from '$lib/script/components/componentHeader/component/types'
  import ParalelInputs from '$lib/components/editors/ParalelInputs.svelte'
  import ConstraintInput from '$lib/components/editors/ConstraintInput.svelte'
  import { Label } from '$lib/components/ui/index'

  /**
   * The meta-schema is passed whole rather than one bindable constraint at a time, because an unset
   * constraint is an **absent key** and only the object's owner can remove one. See
   * `ConstraintInput`.
   */
  interface Props {
    schema: NumberMetaSchema
  }
  const { schema }: Props = $props()
</script>

<Label>
  Default:
  <ConstraintInput {schema} constraint="default" />
</Label>
<ParalelInputs>
  <Label>
    Minimum value:
    <ConstraintInput {schema} constraint="minimum" />
  </Label>
  <Label>
    Maximum value:
    <ConstraintInput {schema} constraint="maximum" />
  </Label>
  <Label>
    Steps:
    <ConstraintInput {schema} constraint="multipleOf" />
  </Label>
</ParalelInputs>
