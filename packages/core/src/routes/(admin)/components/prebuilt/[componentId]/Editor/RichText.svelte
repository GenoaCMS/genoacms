<script lang="ts">
  import type { StringMetaSchema } from '$lib/script/components/componentHeader/component/types'
  import ParalelInputs from '$lib/components/editors/ParalelInputs.svelte'
  import ConstraintInput from '$lib/components/editors/ConstraintInput.svelte'
  import { Label, Textarea } from '$lib/components/ui/index'
  import { setConstraint } from '$lib/script/components/componentHeader/component/constraints'

  interface Props {
    schema: StringMetaSchema
  }
  const { schema }: Props = $props()
</script>

<Label class="pb-2">
  Default:
  <!-- Not bound: an emptied default must remove the key, and `bind:` can only assign. -->
  <Textarea
    value={schema.default ?? ''}
    oninput={(e: Event & { currentTarget: HTMLTextAreaElement }) =>
      setConstraint(schema, 'default', e.currentTarget.value)}
  />
</Label>
<ParalelInputs>
  <Label class="pb-2">
    Minimum length:
    <ConstraintInput {schema} constraint="minLength" />
  </Label>
  <Label class="pb-2">
    Maximum length:
    <ConstraintInput {schema} constraint="maxLength" />
  </Label>
  <Label class="pb-2">
    Regex pattern:
    <ConstraintInput {schema} constraint="pattern" kind="text" />
  </Label>
  <Label class="pb-2">
    Format:
    <ConstraintInput {schema} constraint="format" kind="text" />
  </Label>
</ParalelInputs>
