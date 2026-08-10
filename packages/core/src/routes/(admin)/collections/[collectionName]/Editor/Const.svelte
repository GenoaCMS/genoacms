<script lang="ts">
  import type { InputValue } from './types'

  type Props = {
    constValue: InputValue
    onvalue: (e: InputValue) => void
  }
  const { constValue, onvalue }: Props = $props()

  onvalue(constValue)
</script>
