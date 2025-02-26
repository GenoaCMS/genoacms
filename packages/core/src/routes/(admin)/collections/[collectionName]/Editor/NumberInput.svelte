<script lang="ts">
  import type { NumberValue, Constraints, Errors } from './types'
  import type { FormEventHandler } from 'svelte/elements'
  import type { JSONSchemaType } from 'ajv'
  import { Input } from 'flowbite-svelte'

  type Props = {
    schema: JSONSchemaType<NumberValue>
    value: NumberValue,
    constraints: Constraints,
    errors: Errors,
    onvalue: (e: NumberValue) => void
  }
  const { value, errors, constraints, onvalue }: Props = $props()
  const v = $state(value)

  const oninput: FormEventHandler<HTMLInputElement> = (event) => {
    const element = event.target as HTMLInputElement
    onvalue(Number(element.value))
  }
</script>

<Input
  type="number"
  value={v}
  aria-invalid={errors ? 'true' : undefined}
  color={errors ? 'red' : 'base'}
  {...constraints}
  {oninput}/>
