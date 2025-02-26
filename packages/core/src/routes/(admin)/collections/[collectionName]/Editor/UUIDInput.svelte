<script lang="ts">
  import { ButtonGroup, Input, InputAddon } from 'flowbite-svelte'

  type Props = {
    value: string,
    errors: Array<string> | undefined,
    onvalue: (e: string) => void
  }
  let { value, errors, onvalue }: Props = $props()

  function generateUUID () {
    value = crypto.randomUUID()
    onvalue(value)
  }
</script>

<ButtonGroup class="w-full">
  <InputAddon>
    <button type="button" on:click={generateUUID}><i class="bi bi-dice-5-fill"></i></button>
  </InputAddon>
  <Input
    {value}
    aria-invalid={errors ? 'true' : undefined}
    color={errors ? 'red' : 'base'}
    oninput={e => onvalue(e.target.value)}/>
</ButtonGroup>
