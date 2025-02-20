<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Checkbox } from 'flowbite-svelte'

  type Props = {
    schema: JSONSchemaType<boolean>
    value: boolean,
    onvalue: (e: boolean) => void
  }
  const { value, onvalue }: Props = $props()
  const v = $state(value)
</script>

<Checkbox checked={v} onchange={e => onvalue(e.target.value)}/>
