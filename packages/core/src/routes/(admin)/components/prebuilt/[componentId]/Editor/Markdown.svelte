<script lang="ts">
  import type { StringMetaSchema } from '$lib/script/components/componentEntry/component/types'
  import { Input, Label } from '$lib/components/ui/index'
  import CodeEditor from '$lib/components/ui/CodeEditor.svelte'
  import ParalelInputs from '$lib/components/editors/ParalelInputs.svelte'

  interface Props {
    default: StringMetaSchema['default'];
    minLength: StringMetaSchema['minLength'];
    maxLength: StringMetaSchema['maxLength'];
    pattern: StringMetaSchema['pattern'];
    format: StringMetaSchema['format'];
  }
  let {
    default: d = $bindable(),
    minLength = $bindable(),
    maxLength = $bindable(),
    pattern = $bindable(),
    format = $bindable(),
  }: Props = $props()
</script>

<Label class="pb-2">
  Default:
  <CodeEditor language="markdown" bind:value={d} class="min-h-[10rem]" />
</Label>
<ParalelInputs>
  <Label>
    Minimum length:
    <Input type="number" bind:value={minLength} />
  </Label>
  <Label>
    Maximum length:
    <Input type="number" bind:value={maxLength} />
  </Label>
  <Label>
    Regex pattern:
    <Input type="text" bind:value={pattern} />
  </Label>
  <Label>
    Format:
    <Input type="text" bind:value={format} />
  </Label>
</ParalelInputs>
