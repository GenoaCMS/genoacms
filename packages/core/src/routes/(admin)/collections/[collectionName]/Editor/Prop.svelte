<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Label } from 'flowbite-svelte'
  import Input from './Input.svelte'
  import type { InputValue } from './types'

  interface Props {
    name: string
    schema: JSONSchemaType<InputValue>
    value: InputValue
    onvalue: (value: InputValue) => void
  }
  const { name, schema, value, onvalue }: Props = $props()
</script>

<Label>
  {name}:
  <Input {schema} {value} {onvalue} />
</Label>
