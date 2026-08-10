<script lang="ts">
  import type { StringValue } from './types'

  type Props = {
    constValue: StringValue
    onvalue: (e: StringValue) => void
  }
  const { constValue, onvalue }: Props = $props()

  onvalue(constValue)
</script>
