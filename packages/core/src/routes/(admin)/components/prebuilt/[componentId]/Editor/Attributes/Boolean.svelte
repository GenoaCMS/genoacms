<script lang="ts">
  import { Checkbox } from 'flowbite-svelte'

  interface Props {
    default: boolean
  }
  let { default: d = $bindable() }: Props = $props()
</script>

<Checkbox bind:checked={d} />
