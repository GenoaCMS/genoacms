<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Checkbox } from 'flowbite-svelte'

  type Props = {
    schema: JSONSchemaType<boolean>
    value: boolean,
    constraints: Record<string, unknown> | undefined,
    errors: Array<string> | undefined,
    onvalue: (e: boolean) => void
  }
  const { value, constraints, errors, onvalue }: Props = $props()
  const v = $state(value)
</script>

<Checkbox
  checked={v}
  aria-invalid={errors ? 'true' : undefined}
  color={errors ? 'red' : 'base'}
  {...constraints}
  onchange={e => onvalue(e.target.value)}/>
