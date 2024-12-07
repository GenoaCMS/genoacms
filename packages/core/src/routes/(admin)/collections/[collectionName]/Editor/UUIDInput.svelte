<script lang="ts">
  import { ButtonGroup, Input, InputAddon } from 'flowbite-svelte'

  export let name: string
  export let value: string

  function generateUUID () {
    value = crypto.randomUUID()
  }
</script>

<ButtonGroup class="w-full">
  <InputAddon>
    <button type="button" on:click={generateUUID}><i class="bi bi-dice-5-fill"></i></button>
  </InputAddon>
  <Input {name} bind:value/>
</ButtonGroup>
