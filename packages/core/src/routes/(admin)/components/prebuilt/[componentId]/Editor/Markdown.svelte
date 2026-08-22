<script lang="ts">
  import type { StringMetaSchema } from '$lib/script/components/componentEntry/component/types'
  import { Label } from '$lib/components/ui/index'
  import CodeEditor from '$lib/components/ui/CodeEditor.svelte'
  import ParalelInputs from '$lib/components/editors/ParalelInputs.svelte'
  import ConstraintInput from '$lib/components/editors/ConstraintInput.svelte'
  import { setConstraint } from '$lib/script/components/componentEntry/component/constraints'

  interface Props {
    schema: StringMetaSchema
  }
  const { schema }: Props = $props()
</script>

<Label class="pb-2">
  Default:
  <!-- Reported through `onvalue` rather than bound, so an emptied default removes the key. -->
  <CodeEditor
    language="markdown"
    value={schema.default ?? ''}
    onvalue={(v: string) => setConstraint(schema, 'default', v)}
    class="min-h-[10rem]"
  />
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
