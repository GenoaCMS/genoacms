<script lang="ts">
  import type { TextValue } from './types'
  import type { JSONSchemaType } from 'ajv'
  import type { FormEventHandler } from 'svelte/elements'
  import { Textarea } from 'flowbite-svelte'

  interface Props {
    schema: JSONSchemaType<TextValue>
    value: TextValue
    onvalue: (e: TextValue) => void
  };
  const { value, onvalue }: Props = $props()

  const oninput = (e: Event) => {
    onvalue((e.currentTarget as HTMLTextAreaElement).value)
  }
  if (value === undefined) onvalue('')
</script>

<Textarea {value} {oninput} />
