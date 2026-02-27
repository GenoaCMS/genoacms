<script lang="ts">
  import type { NumberValue } from './types'
  import type { JSONSchemaType } from 'ajv'
  import { Input } from 'flowbite-svelte'

  interface Props {
    schema: JSONSchemaType<NumberValue>
    value: NumberValue
    onvalue: (e: NumberValue) => void
  }
  const { value, onvalue }: Props = $props()

  const oninput = (event: Event) => {
    const element = event.currentTarget as HTMLInputElement
    onvalue(Number(element.value))
  }
  if (value === undefined) onvalue(0)
</script>

<Input type="number" {value} {oninput} />
