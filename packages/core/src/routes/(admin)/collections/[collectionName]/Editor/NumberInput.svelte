<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Input } from 'flowbite-svelte'

  type Props = {
    schema: JSONSchemaType<number>
    value: number,
    constraints: Record<string, unknown> | undefined,
    errors: Array<string> | undefined,
    onvalue: (e: number) => void
  }
  const { value, errors, constraints, onvalue }: Props = $props()
  const v = $state(value)
</script>

<Input
  type="number"
  value={v}
  aria-invalid={errors ? 'true' : undefined}
  color={errors ? 'red' : 'base'}
  {...constraints}
  oninput={e => onvalue(Number(e.target.value))}/>
