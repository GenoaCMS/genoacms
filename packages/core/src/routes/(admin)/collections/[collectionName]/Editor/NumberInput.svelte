<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Input } from 'flowbite-svelte'

  type Props = {
    schema: JSONSchemaType<number>
    value: number,
    onvalue: (e: number) => void
  }
  const { value, onvalue }: Props = $props()
  let v = $state(value)
  $effect(() => onvalue(v))
</script>

<Input type="number" bind:value={v}/>
