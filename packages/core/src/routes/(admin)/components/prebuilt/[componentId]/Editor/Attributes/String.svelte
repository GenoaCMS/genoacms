<script lang="ts">
  import { Input, Label } from 'flowbite-svelte'

  interface Props {
    default: string,
    minLength: number,
    maxLength: number,
    pattern: string,
    format: string
  }
  let { default: d = $bindable(), minLength = $bindable(), maxLength = $bindable(), pattern = $bindable(), format = $bindable() }: Props = $props()
</script>

<Label>
  Default:
  <Input type="text" bind:value={d} />
</Label>
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
