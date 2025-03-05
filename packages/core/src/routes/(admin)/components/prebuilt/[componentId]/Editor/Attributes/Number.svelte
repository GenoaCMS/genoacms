<script lang="ts">
  import { Input, Label } from 'flowbite-svelte'

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
