<script lang="ts">
  export let name: string
  export let constValue: string
  export let value: string

  $: value = constValue
</script>

<input type="hidden" {name} bind:value/>
