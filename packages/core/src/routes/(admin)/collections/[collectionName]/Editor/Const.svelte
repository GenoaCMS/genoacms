<script lang="ts">
  type Props = {
    name: string
    constValue: string
    value: string
  }
  let { name, constValue, value = $bindable() }: Props = $props()

  value = constValue
</script>

<input type="hidden" {name} bind:value/>
