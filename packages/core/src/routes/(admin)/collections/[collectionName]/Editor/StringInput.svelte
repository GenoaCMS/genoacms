<script lang="ts">
  import { untrack } from 'svelte'
  import type { StringValue } from '#lib/components/editors/types.js'
  import type { Schema } from '@exodus/schemasafe'
  import { Input } from '#lib/components/ui/index.js'

  interface Props {
    schema: Schema
    value: StringValue
    onvalue: (e: StringValue) => void
    id?: string
  }
  const { value, onvalue, id }: Props = $props()

  const oninput = (event: Event) => {
    const element = event.currentTarget as HTMLInputElement
    onvalue(element.value)
  }
  untrack(() => {
    if (value === undefined) onvalue('')
  })
</script>

<Input {id} {value} {oninput} />
