<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Input } from 'flowbite-svelte'

  type Props = {
    schema: JSONSchemaType<string>,
    value: string,
    onvalue: (e: string) => void
  }
  const { value, onvalue }: Props = $props()
  let v = $state(value)
  $effect(() => onvalue(v))
</script>

<Input bind:value={v}/>
