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

<div class="flex justify-between items-center">
  <Label>
    Minimum resources:
    <Input type="number" bind:value={minItems} />
  </Label>
  <div>
    -
  </div>
  <Label>
    Maximum resources
    <Input type="number" bind:value={maxItems} />
  </Label>
</div>
