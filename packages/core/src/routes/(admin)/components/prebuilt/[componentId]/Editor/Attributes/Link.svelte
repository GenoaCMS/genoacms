<script lang="ts">
  import { Input, Label } from 'flowbite-svelte'

  interface Props {
    default: Array<string>,
    maxItems: number,
    minItems: number
  }

  let {
    default: d = $bindable(), // TODO: default value selector, !except recursion
    maxItems = $bindable(),
    minItems = $bindable()
  }: Props = $props()
</script>

<Label>
  Minimum links:
  <Input type="number" bind:value={minItems} />
</Label>
<Label>
  Maximum links
  <Input type="number" bind:value={maxItems} />
</Label>
