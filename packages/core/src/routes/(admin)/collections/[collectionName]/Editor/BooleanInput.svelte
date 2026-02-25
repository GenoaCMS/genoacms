<script lang="ts">
  import type { BooleanValue, Constraints, Errors } from './types'
  import type { FormEventHandler } from 'svelte/elements'
  import type { JSONSchemaType } from 'ajv'
  import { Checkbox } from 'flowbite-svelte'

  type Props = {
    schema: JSONSchemaType<BooleanValue>
    value: BooleanValue,
    constraints: Constraints,
    errors: Errors,
    onvalue: (e: BooleanValue) => void
  }
  const { value, constraints, errors, onvalue }: Props = $props()
  const v = $state(value)
  const onchange: FormEventHandler<HTMLInputElement> = (event) => {
    const element = event.target as HTMLInputElement
    onvalue(Boolean(element.checked))
  }
  if (value === undefined) onvalue(false)
</script>

<Checkbox
  checked={v}
  aria-invalid={errors ? 'true' : undefined}
  color={errors ? 'red' : 'base'}
  {...constraints}
  {onchange}/>
