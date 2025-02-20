<script lang="ts">
  type Props = {
    constValue: string
    onvalue: (e: string) => void
  }
  const { constValue, onvalue }: Props = $props()

  onvalue(constValue)
</script>
