<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Input } from 'flowbite-svelte'

  type Props = {
    schema: JSONSchemaType<string>,
    value: string,
    onvalue: (e: string) => void
  }
  const { value, onvalue }: Props = $props()
  const v = $state(value)
</script>

<Input value={v} oninput={e => onvalue(e.target.value)}/>
