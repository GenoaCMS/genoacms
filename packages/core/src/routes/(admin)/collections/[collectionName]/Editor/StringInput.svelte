<script lang="ts">
  import type { StringValue, Constraints, Errors } from './types'
  import type { JSONSchemaType } from 'ajv'
  import type { FormEventHandler } from 'svelte/elements'
  import { Input } from 'flowbite-svelte'

  type Props = {
    schema: JSONSchemaType<StringValue>,
    value: StringValue,
    constraints: Constraints,
    errors: Errors,
    onvalue: (e: StringValue) => void
  }
  const { value, constraints, errors, onvalue }: Props = $props()
  const v = $state(value)

  const oninput: FormEventHandler<HTMLInputElement> = (event) => {
    const element = event.target as HTMLInputElement
    onvalue(element.value)
  }
</script>

<Input
  value={v}
  aria-invalid={errors ? 'true' : undefined}
  color={errors ? 'red' : 'base'}
  {...constraints}
  {oninput}/>
