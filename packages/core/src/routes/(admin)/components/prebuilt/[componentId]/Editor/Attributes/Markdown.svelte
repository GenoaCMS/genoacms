<script lang="ts">
  import { Input, Label } from 'flowbite-svelte'
  import MonacoEditor from '$lib/components/MonacoEditor.svelte'

  interface Props {
    default: string,
    minLength: number,
    maxLength: number,
    pattern: string,
    format: string
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
  <MonacoEditor language="markdown" bind:value={d} class="min-h-[10rem]" />
</Label>
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
