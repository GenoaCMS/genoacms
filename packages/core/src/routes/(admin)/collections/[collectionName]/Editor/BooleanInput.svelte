<script lang="ts">
  import { untrack } from 'svelte'
  import type { BooleanValue } from '#lib/components/editors/types.js'
  import type { Schema } from '@exodus/schemasafe'

  interface Props {
    schema: Schema;
    value: BooleanValue;
    onvalue: (e: BooleanValue) => void;
    id?: string
  }
  const { value, onvalue, id }: Props = $props()

  const onchange = (event: Event) => {
    const element = event.currentTarget as HTMLInputElement
    onvalue(Boolean(element.checked))
  }
  untrack(() => {
    if (value === undefined) onvalue(false)
  })
</script>

<input {id} type="checkbox" class="checkbox" checked={value} {onchange} />
