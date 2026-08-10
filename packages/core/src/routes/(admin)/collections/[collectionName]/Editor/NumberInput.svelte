<script lang="ts">
  import type { NumberValue } from './types'
  import type { Schema } from '@exodus/schemasafe'
  import { Input } from '$lib/components/ui/index'

  interface Props {
    schema: Schema
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
