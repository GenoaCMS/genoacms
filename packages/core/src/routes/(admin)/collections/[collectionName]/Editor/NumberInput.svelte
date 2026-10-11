<script lang="ts">
  import { untrack } from 'svelte'
  import type { NumberValue } from '$lib/components/editors/types'
  import type { Schema } from '@exodus/schemasafe'
  import { Input } from '$lib/components/ui/index'

  interface Props {
    schema: Schema
    value: NumberValue
    onvalue: (e: NumberValue) => void
    id?: string
  }
  const { value, onvalue, id }: Props = $props()

  const oninput = (event: Event) => {
    const element = event.currentTarget as HTMLInputElement
    onvalue(Number(element.value))
  }
  untrack(() => {
    if (value === undefined) onvalue(0)
  })
</script>

<Input {id} type="number" step="any" {value} {oninput} />
