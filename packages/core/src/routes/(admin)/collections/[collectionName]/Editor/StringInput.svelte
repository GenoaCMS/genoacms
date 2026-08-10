<script lang="ts">
  import type { StringValue } from './types'
  import type { Schema } from '@exodus/schemasafe'
  import { Input } from '$lib/components/ui/index'

  interface Props {
    schema: Schema
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
