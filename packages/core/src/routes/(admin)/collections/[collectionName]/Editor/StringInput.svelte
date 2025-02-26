<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Input } from 'flowbite-svelte'

  type Props = {
    schema: JSONSchemaType<string>,
    value: string,
    constraints: Record<string, unknown> | undefined,
    errors: Array<string> | undefined,
    onvalue: (e: string) => void
  }
  const { value, constraints, errors, onvalue }: Props = $props()
  const v = $state(value)
</script>

<Input
  value={v}
  aria-invalid={errors ? 'true' : undefined}
  color={errors ? 'red' : 'base'}
  {...constraints}
  oninput={e => onvalue(e.target.value)}/>
