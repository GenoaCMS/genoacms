<script lang="ts">
  import type { BooleanValue } from './types'
  import type { JSONSchemaType } from 'ajv'
  import { Checkbox } from 'flowbite-svelte'

  interface Props {
    schema: JSONSchemaType<BooleanValue>;
    value: BooleanValue;
    onvalue: (e: BooleanValue) => void;
  }
  const { value, onvalue }: Props = $props()

  const onchange = (event: Event) => {
    const element = event.currentTarget as HTMLInputElement
    onvalue(Boolean(element.checked))
  }
  if (value === undefined) onvalue(false)
</script>

<Checkbox checked={value} {onchange} />
