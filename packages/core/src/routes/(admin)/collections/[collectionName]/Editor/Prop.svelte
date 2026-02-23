<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Label } from 'flowbite-svelte'
  import Input from './Input.svelte'
  import type { InputValue, Constraints, Errors } from './types'

  interface Props {
    name: string
    schema: JSONSchemaType<InputValue>
    value: InputValue
    errors: Errors
    constraints: Constraints
    onvalue: (value: InputValue) => void
  }
  const { name, schema, value, errors, constraints, onvalue }: Props = $props()
</script>

<Label>
  {name}:
  <Input
    {schema}
    {value}
    {onvalue}
    {errors}
    {constraints}
  />
</Label>
