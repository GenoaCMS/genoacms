<script lang="ts">
  import ParalelInputs from '$lib/components/editors/ParalelInputs.svelte'
  import { Input, Label } from '$lib/components/ui/index'

  interface Props {
    default: number,
    minimum: number,
    maximum: number,
    multipleOf: number
  }
  let { default: d = $bindable(), minimum = $bindable(), maximum = $bindable(), multipleOf = $bindable() }: Props = $props()
</script>

<Label>
  Default:
  <Input type="number" bind:value={d} />
</Label>
<ParalelInputs>
  <Label>
    Minimum value:
    <Input type="number" bind:value={minimum} />
  </Label>
  <Label>
    Maximum value:
    <Input type="number" bind:value={maximum} />
  </Label>
  <Label>
    Steps:
    <Input type="number" bind:value={multipleOf} />
  </Label>
</ParalelInputs>
