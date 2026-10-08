<script lang="ts">
  import { untrack } from 'svelte'
  import type { InputValue } from '$lib/components/editors/types'

  type Props = {
    constValue: InputValue
    onvalue: (e: InputValue) => void
  }
  const { constValue, onvalue }: Props = $props()

  untrack(() => onvalue(constValue))
</script>
