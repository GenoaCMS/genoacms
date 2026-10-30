<script lang="ts">
  import { Checkbox, Label } from '#lib/components/ui/index.js'

  interface Props {
    default?: boolean
  }
  let { default: d = $bindable() }: Props = $props()
</script>

<Label>
  Default value:
  <Checkbox bind:checked={d} />
</Label>
