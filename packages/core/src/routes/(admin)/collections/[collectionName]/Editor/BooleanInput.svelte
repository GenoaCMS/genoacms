<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Checkbox } from 'flowbite-svelte'

  type Props = {
    schema: JSONSchemaType<boolean>
    value: boolean,
    onvalue: (e: boolean) => void
  }
  const { value, onvalue }: Props = $props()
  let v = $state(value)
  $effect(() => onvalue(v))
</script>

<Checkbox bind:checked={v}/>
