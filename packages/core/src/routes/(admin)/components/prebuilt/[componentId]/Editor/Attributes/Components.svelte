<script lang="ts">
  import ParalelInputs from '$lib/components/editors/ParalelInputs.svelte'
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

<ParalelInputs>
  <Label>
    Minimum instances:
    <Input type="number" bind:value={minItems} />
  </Label>
  <Label>
    Maximum instances:
    <Input type="number" bind:value={maxItems} />
  </Label>
</ParalelInputs>
