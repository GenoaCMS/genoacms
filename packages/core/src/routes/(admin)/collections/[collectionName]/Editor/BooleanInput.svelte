<script lang="ts">
  import { untrack } from 'svelte'
  import type { BooleanValue } from '$lib/components/editors/types'
  import type { Schema } from '@exodus/schemasafe'
  import { Checkbox } from '$lib/components/ui/index'

  interface Props {
    schema: Schema;
    value: BooleanValue;
    onvalue: (e: BooleanValue) => void;
  }
  const { value, onvalue }: Props = $props()

  const onchange = (event: Event) => {
    const element = event.currentTarget as HTMLInputElement
    onvalue(Boolean(element.checked))
  }
  untrack(() => {
    if (value === undefined) onvalue(false)
  })
</script>

<Checkbox checked={value} {onchange} />
