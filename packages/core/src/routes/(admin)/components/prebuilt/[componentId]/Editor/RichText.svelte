<script lang="ts">
  import type { StringMetaSchema } from '$lib/script/components/componentEntry/component/types'
  import ParalelInputs from '$lib/components/editors/ParalelInputs.svelte'
  import { Input, Label, Textarea } from '$lib/components/ui/index'

  interface Props {
    default: StringMetaSchema['default'],
    minLength: StringMetaSchema['minLength'],
    maxLength: StringMetaSchema['maxLength'],
    pattern: StringMetaSchema['pattern'],
    format: StringMetaSchema['format']
  }
  let {
    default: d = $bindable(),
    minLength = $bindable(),
    maxLength = $bindable(),
    pattern = $bindable(),
    format = $bindable()
  }: Props = $props()
</script>

<Label class="pb-2">
  Default:
  <Textarea bind:value={d} />
</Label>
<ParalelInputs>
  <Label class="pb-2">
    Minimum length:
    <Input type="number" bind:value={minLength} />
  </Label>
  <Label class="pb-2">
    Maximum length:
    <Input type="number" bind:value={maxLength} />
  </Label>
  <Label class="pb-2">
    Regex pattern:
    <Input type="text" bind:value={pattern} />
  </Label>
  <Label class="pb-2">
    Format:
    <Input type="text" bind:value={format} />
  </Label>
</ParalelInputs>
