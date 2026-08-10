<script lang="ts">
  import type { TextValue } from './types'
  import type { Schema } from '@exodus/schemasafe'
  import { Textarea } from '$lib/components/ui/index'

  interface Props {
    schema: Schema
    value: TextValue
    onvalue: (e: TextValue) => void
  }
  const { value, onvalue }: Props = $props()

  const oninput = (e: Event) => {
    onvalue((e.currentTarget as HTMLTextAreaElement).value)
  }
  if (value === undefined) onvalue('')
</script>

<Textarea {value} {oninput} />
