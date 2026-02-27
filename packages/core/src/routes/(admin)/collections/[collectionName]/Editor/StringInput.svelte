<script lang="ts">
  import type { StringValue } from './types'
  import type { JSONSchemaType } from 'ajv'
  import { Input } from 'flowbite-svelte'

  interface Props {
    schema: JSONSchemaType<StringValue>
    value: StringValue
    onvalue: (e: StringValue) => void
  }
  const { value, onvalue }: Props = $props()

  const oninput = (event: Event) => {
    const element = event.currentTarget as HTMLInputElement
    onvalue(element.value)
  }
  if (value === undefined) onvalue('')
</script>

<Input {value} {oninput} />
