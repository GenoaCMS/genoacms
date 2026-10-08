<script lang="ts">
  import { untrack } from 'svelte'
  import type { StringValue } from '$lib/components/editors/types'
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
  untrack(() => {
    if (value === undefined) onvalue('')
  })
</script>

<Input {value} {oninput} />
