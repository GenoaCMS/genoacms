<script lang="ts">
  import type { TextValue, Constraints, Errors } from './types'
  import type { JSONSchemaType } from 'ajv'
  import type { FormEventHandler } from 'svelte/elements'
  import { Textarea } from 'flowbite-svelte'

  type Props = {
    schema: JSONSchemaType<TextValue>,
    value: TextValue,
    constraints: Constraints,
    errors: Errors,
    onvalue: (e: TextValue) => void
  }
  const { value, constraints, errors, onvalue }: Props = $props()
  const v = $state(value)
  const oninput: FormEventHandler<HTMLTextAreaElement> = (e) => {
    onvalue((e.target as HTMLTextAreaElement).value)
  }
</script>

<Textarea
  value={v}
  aria-invalid={errors ? 'true' : undefined}
  color={errors ? 'red' : 'base'}
  {...constraints}
  {oninput}/>
