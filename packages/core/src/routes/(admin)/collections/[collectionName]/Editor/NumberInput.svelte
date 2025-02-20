<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Input } from 'flowbite-svelte'

  type Props = {
    schema: JSONSchemaType<number>
    value: number,
    onvalue: (e: number) => void
  }
  const { value, onvalue }: Props = $props()
  const v = $state(value)
</script>

<Input type="number" value={v} oninput={e => onvalue(e.target.value)}/>
